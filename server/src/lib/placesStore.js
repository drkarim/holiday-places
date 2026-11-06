import { getDb, getAdmin } from './firebase.js';
import { fieldByRole } from './schema.js';
import { resolveMapsLink } from './mapsLink.js';
import { extractPhone, extractWebsite, telHref } from './contact.js';
import { buildDedupeKey } from './dedupeKey.js';
import { shortLabel } from './shortLabel.js';
import { searchStockPhoto } from './pexels.js';
import { searchCategoryPhoto } from './wikimedia.js';
import { cardName } from './cardName.js';
import { googlePlacesEnabled, findGooglePlace, getGooglePhoto, QuotaPausedError } from './googlePlaces.js';
import { getTrip, updateTrip, photoLocation, LEGACY_TRIP } from './trips.js';

const PLACES = 'places';
const META = 'meta';
// Bump the version to discard previously cached picks after changing how
// category photos are chosen.
const CATEGORY_PHOTOS_DOC = 'categoryPhotos_v3';

// The place name Commons photo titles must mention for a category photo to
// count as local: the trip's city, else its country ("Beach" -> a Barbados
// beach, "Café" -> a Tromsø café).
function commonsLocation(trip) {
  return trip.city || trip.country || '';
}

function slugifyCategory(label) {
  return String(label || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Prefer Pexels (curated stock photography) when a key is configured; fall
// back to Wikimedia Commons (no key needed) otherwise, or if Pexels has
// nothing for the query. This also means a category photo picked up on
// Wikimedia upgrades automatically to Pexels later just by setting the key —
// the cache below only remembers the photo, not which source it came from.
async function fetchCategoryPhoto(category, location) {
  if (process.env.PEXELS_API_KEY) {
    const pexels = await searchStockPhoto(category);
    if (pexels) return pexels;
  }
  return searchCategoryPhoto(category, location);
}

// Category-level stock photos are cached indefinitely in one small Firestore
// doc (not per-place) — a handful of categories, fetched once each, reused by
// every place sharing that category and every request after the first.
async function resolveCategoryPhoto(category, location) {
  // Keyed with the location, so each trip gets its own local picks.
  const key = slugifyCategory(`${category} ${location}`);
  if (!key) return null;

  const ref = getDb().collection(META).doc(CATEGORY_PHOTOS_DOC);
  const snap = await ref.get();
  const cache = (snap.exists && snap.data()) || {};
  if (cache[key]) return cache[key];

  const photo = await fetchCategoryPhoto(category, location);
  if (!photo) return null;

  await ref.set({ [key]: photo }, { merge: true });
  return photo;
}

// Umbrella words that make a poor photo search on their own, e.g. the
// "Activity" in "Activity / Snorkelling".
const GENERIC_CATEGORIES = new Set([
  'activity', 'activities', 'attraction', 'attractions', 'experience', 'leisure',
  'entertainment', 'sport', 'sports', 'tour', 'things to do', 'other', 'misc',
]);

// The term a category photo is searched (and cached) by: normally the short
// label, but the next "/"-separated part when the label is just an umbrella
// word ("Activity / Snorkelling" -> "Snorkelling").
function photoCategory(typeValue) {
  const category = shortLabel(typeValue);
  if (!category || !GENERIC_CATEGORIES.has(category.toLowerCase())) return category;
  const specific = String(typeValue).split('/')[1];
  return (specific && shortLabel(specific)) || category;
}

// Attaches a `categoryPhoto` to any place that has no real photos of its
// own, resolving each distinct category at most once per call.
async function attachCategoryPhotos(places, trip) {
  const typeField = fieldByRole(trip.schema, 'type');
  if (!typeField) return places;

  const needed = new Map(); // category -> promise
  for (const place of places) {
    if (place.photos.length || place.googlePhoto) continue;
    const category = photoCategory(place.fields[typeField.key]);
    if (!category || needed.has(category)) continue;
    needed.set(category, resolveCategoryPhoto(category, commonsLocation(trip)));
  }

  const resolved = new Map();
  for (const [category, promise] of needed) {
    resolved.set(category, await promise);
  }

  for (const place of places) {
    if (place.photos.length || place.googlePhoto) continue;
    const category = photoCategory(place.fields[typeField.key]);
    place.categoryPhoto = resolved.get(category) || null;
  }
  return places;
}

// Links a place to its Google listing, once: the result (including "no
// match") is stored on the place as `google`, and only redone when the name
// changes. A hand-picked match (`manual`) is kept even then.
async function ensureGoogleMatch(doc, trip) {
  const nameField = fieldByRole(trip.schema, 'name');
  const name = cardName(nameField ? doc.fields?.[nameField.key] : '');
  const stored = doc.google;
  if (stored && (stored.manual || stored.forName === name)) return stored.placeId || null;
  if (!name) return null;

  try {
    const match = await findGooglePlace(name, { near: photoLocation(trip), country: trip.country });
    const google = {
      placeId: match?.placeId || null,
      googleName: match?.googleName || null,
      forName: name,
      checkedAt: new Date().toISOString(),
    };
    await getDb().collection(PLACES).doc(doc.id).set({ google }, { merge: true });
    doc.google = google;
    return google.placeId;
  } catch (err) {
    if (!(err instanceof QuotaPausedError)) {
      console.warn(`Google match failed for "${name}", will retry later:`, err.message);
    }
    return stored?.placeId || null;
  }
}

// Short tag of the Google place a photo belongs to, put in the photo URL so
// a re-matched place doesn't hit the old cached image.
function googleRef(placeId) {
  return placeId.slice(-12);
}

export function googlePhotoFor(placeId, photo, id, tripSlug) {
  return {
    id: 'google',
    url: `/api/trips/${tripSlug}/places/${id}/google-photo?ref=${encodeURIComponent(googleRef(placeId))}`,
    source: 'google',
    caption: null,
    attribution: photo.author ? `Photo: ${photo.author} · Google Maps` : 'Photo: Google Maps',
  };
}

async function inBatches(items, size, fn) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

// Adds a Google Maps photo to places that have none of their own. Matching
// runs once per place (stored); photo details come from an in-memory cache.
// When the place is matched but its photo couldn't be checked just now, it
// is flagged `googlePhotoUnconfirmed` with its `googleRef`, so a phone that
// already has that place's Google photo keeps showing it.
async function attachGooglePhotos(entries, trip) {
  if (!googlePlacesEnabled()) return;
  await inBatches(
    entries.filter(({ place }) => !place.photos.length),
    6,
    async ({ place, doc }) => {
      const placeId = await ensureGoogleMatch(doc, trip);
      if (!placeId) return;
      const photo = await getGooglePhoto(placeId);
      if (photo) place.googlePhoto = googlePhotoFor(placeId, photo, place.id, trip.slug);
      else if (photo === undefined) {
        place.googlePhotoUnconfirmed = true;
        place.googleRef = googleRef(placeId);
      }
    }
  );
}

// Each trip has its own spreadsheet columns.
export async function getSchema(tripSlug = LEGACY_TRIP) {
  const trip = await getTrip(tripSlug);
  return trip?.schema || { fields: [], generatedAt: null };
}

export async function setSchema(schema, tripSlug = LEGACY_TRIP) {
  await updateTrip(tripSlug, { schema });
}

export async function getImportStatus() {
  const snap = await getDb().collection(META).doc('importStatus').get();
  return snap.exists ? snap.data() : null;
}

export async function setImportStatus(status) {
  await getDb().collection(META).doc('importStatus').set(status, { merge: true });
}

function toPlainDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  return value;
}

// Decorate a stored place doc with values the UI needs but that must stay
// derived (so edits to name/address keep the maps-link fallback correct).
export function decoratePlace(doc, schema) {
  const nameField = fieldByRole(schema, 'name');
  const addressField = fieldByRole(schema, 'address');
  const contactField = fieldByRole(schema, 'contact');
  const phoneField = fieldByRole(schema, 'phone');
  const websiteField = fieldByRole(schema, 'website');

  const fields = doc.fields || {};
  const name = nameField ? fields[nameField.key] : undefined;
  const address = addressField ? fields[addressField.key] : undefined;

  const mapsUrl = resolveMapsLink({
    rawUrl: doc.mapsUrlRaw,
    coords: doc.coords,
    name,
    address,
  });

  let phone = null;
  let website = null;
  if (contactField) {
    const raw = fields[contactField.key];
    phone = extractPhone(raw);
    website = extractWebsite(raw);
  }
  if (phoneField && fields[phoneField.key]) phone = extractPhone(fields[phoneField.key]) || fields[phoneField.key];
  if (websiteField && fields[websiteField.key]) website = fields[websiteField.key];

  return {
    id: doc.id,
    tripId: doc.tripId || LEGACY_TRIP,
    fields,
    visited: !!doc.visited,
    userNotes: doc.userNotes || '',
    photos: doc.photos || [],
    googlePhoto: null,
    categoryPhoto: null,
    coords: doc.coords || null,
    mapsUrl,
    contact: { phone, telHref: telHref(phone), website },
    createdAt: toPlainDate(doc.createdAt),
    updatedAt: toPlainDate(doc.updatedAt),
  };
}

async function requireTrip(tripSlug) {
  const trip = await getTrip(tripSlug);
  if (!trip) throw Object.assign(new Error(`Trip "${tripSlug}" not found.`), { status: 404 });
  return trip;
}

export async function listPlaces(tripSlug = LEGACY_TRIP) {
  const trip = await requireTrip(tripSlug);
  const schema = trip.schema;
  const snap = await getDb().collection(PLACES).where('tripId', '==', trip.slug).get();
  const entries = snap.docs.map((d) => {
    const doc = { id: d.id, ...d.data() };
    return { doc, place: decoratePlace(doc, schema) };
  });
  await attachGooglePhotos(entries, trip);
  const places = entries
    .map(({ place }) => place)
    .sort((a, b) => {
      const an = (fieldByRole(schema, 'name') && a.fields[fieldByRole(schema, 'name').key]) || '';
      const bn = (fieldByRole(schema, 'name') && b.fields[fieldByRole(schema, 'name').key]) || '';
      return String(an).localeCompare(String(bn));
    });
  return attachCategoryPhotos(places, trip);
}

// With tripSlug, a place from another trip counts as not found, so one
// trip's edit key can never reach another trip's places.
export async function getPlace(id, tripSlug) {
  const snap = await getDb().collection(PLACES).doc(id).get();
  if (!snap.exists) return null;
  const doc = { id: snap.id, ...snap.data() };
  const placeTrip = doc.tripId || LEGACY_TRIP;
  if (tripSlug && placeTrip !== tripSlug) return null;
  const trip = await requireTrip(placeTrip);
  const place = decoratePlace(doc, trip.schema);
  await attachGooglePhotos([{ doc, place }], trip);
  const [decorated] = await attachCategoryPhotos([place], trip);
  return decorated;
}

export async function findByDedupeKey(dedupeKey, tripSlug = LEGACY_TRIP) {
  const snap = await getDb()
    .collection(PLACES)
    .where('tripId', '==', tripSlug)
    .where('dedupeKey', '==', dedupeKey)
    .limit(1)
    .get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// Upsert used by the xlsx importer. Spreadsheet-sourced fields are overwritten
// with the latest sheet values; app-added state (visited, userNotes, photos)
// is preserved across re-imports.
export async function upsertFromImport({ tripId = LEGACY_TRIP, dedupeKey, fields, coords, mapsUrlRaw, rowNumber }) {
  const admin = getAdmin();
  const existing = await findByDedupeKey(dedupeKey, tripId);
  const now = admin.firestore.FieldValue.serverTimestamp();

  if (existing) {
    await getDb()
      .collection(PLACES)
      .doc(existing.id)
      .set({ fields, coords, mapsUrlRaw, rowNumber, dedupeKey, updatedAt: now }, { merge: true });
    return { id: existing.id, created: false };
  }

  const ref = await getDb()
    .collection(PLACES)
    .add({
      tripId,
      fields,
      coords: coords || null,
      mapsUrlRaw: mapsUrlRaw || null,
      rowNumber: rowNumber ?? null,
      dedupeKey,
      visited: false,
      userNotes: '',
      photos: [],
      createdAt: now,
      updatedAt: now,
    });
  return { id: ref.id, created: true };
}

export async function createPlace({ tripId = LEGACY_TRIP, fields, coords, visited, userNotes }) {
  const admin = getAdmin();
  const now = admin.firestore.FieldValue.serverTimestamp();
  const schema = await getSchema(tripId);
  const nameField = fieldByRole(schema, 'name');
  const addressField = fieldByRole(schema, 'address');
  const dedupeKey = buildDedupeKey(
    nameField ? fields[nameField.key] : '',
    addressField ? fields[addressField.key] : ''
  );

  const ref = await getDb()
    .collection(PLACES)
    .add({
      tripId,
      fields,
      coords: coords || null,
      mapsUrlRaw: null,
      dedupeKey,
      visited: !!visited,
      userNotes: userNotes || '',
      photos: [],
      createdAt: now,
      updatedAt: now,
    });
  return getPlace(ref.id);
}

export async function updatePlace(id, patch) {
  const admin = getAdmin();
  const ref = getDb().collection(PLACES).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const update = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  if (patch.fields) update.fields = { ...snap.data().fields, ...patch.fields };
  if (typeof patch.visited === 'boolean') update.visited = patch.visited;
  if (typeof patch.userNotes === 'string') update.userNotes = patch.userNotes;
  if (patch.coords !== undefined) update.coords = patch.coords;

  await ref.set(update, { merge: true });
  return getPlace(id);
}

export async function deletePlace(id) {
  await getDb().collection(PLACES).doc(id).delete();
}

export async function addPhoto(id, photo) {
  const ref = getDb().collection(PLACES).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const photos = snap.data().photos || [];
  if (photos.some((p) => p.url === photo.url)) return getPlace(id);
  photos.push(photo);
  await ref.set({ photos }, { merge: true });
  return getPlace(id);
}

export async function removePhoto(id, photoId) {
  const ref = getDb().collection(PLACES).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const photos = (snap.data().photos || []).filter((p) => p.id !== photoId);
  await ref.set({ photos }, { merge: true });
  return getPlace(id);
}

// Raw stored Google link for a place: { placeId, manual, ... } or null.
export async function getGoogleLink(id) {
  const snap = await getDb().collection(PLACES).doc(id).get();
  return snap.exists ? snap.data().google || null : undefined;
}

// Which trip a place belongs to, or null if there is no such place.
export async function placeTripId(id) {
  const snap = await getDb().collection(PLACES).doc(id).get();
  return snap.exists ? snap.data().tripId || LEGACY_TRIP : null;
}

// Overrides the automatic Google match: a placeId (or null to show no Google
// photo), or `undefined` to clear it and let the automatic match run again.
export async function setGoogleLink(id, google) {
  const admin = getAdmin();
  const ref = getDb().collection(PLACES).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  await ref.update({ google: google === undefined ? admin.firestore.FieldValue.delete() : google });
  return getPlace(id);
}
