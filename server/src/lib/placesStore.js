import { getDb, getAdmin } from './firebase.js';
import { fieldByRole } from './schema.js';
import { resolveMapsLink } from './mapsLink.js';
import { extractPhone, extractWebsite, telHref } from './contact.js';
import { buildDedupeKey } from './dedupeKey.js';
import { shortLabel } from './shortLabel.js';
import { searchStockPhoto } from './pexels.js';
import { searchCommonsPhotos } from './wikimedia.js';

const PLACES = 'places';
const META = 'meta';
const CATEGORY_PHOTOS_DOC = 'categoryPhotos';

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
async function fetchCategoryPhoto(category) {
  if (process.env.PEXELS_API_KEY) {
    const pexels = await searchStockPhoto(category);
    if (pexels) return pexels;
  }
  const [commons] = await searchCommonsPhotos(category, 1);
  return commons || null;
}

// Category-level stock photos are cached indefinitely in one small Firestore
// doc (not per-place) — a handful of categories, fetched once each, reused by
// every place sharing that category and every request after the first.
async function resolveCategoryPhoto(category) {
  const key = slugifyCategory(category);
  if (!key) return null;

  const ref = getDb().collection(META).doc(CATEGORY_PHOTOS_DOC);
  const snap = await ref.get();
  const cache = (snap.exists && snap.data()) || {};
  if (cache[key]) return cache[key];

  const photo = await fetchCategoryPhoto(category);
  if (!photo) return null;

  await ref.set({ [key]: photo }, { merge: true });
  return photo;
}

// Attaches a `categoryPhoto` to any place that has no real photos of its
// own, resolving each distinct category at most once per call.
async function attachCategoryPhotos(places, schema) {
  const typeField = fieldByRole(schema, 'type');
  if (!typeField) return places;

  const needed = new Map(); // category -> promise
  for (const place of places) {
    if (place.photos.length) continue;
    const category = shortLabel(place.fields[typeField.key]);
    if (!category || needed.has(category)) continue;
    needed.set(category, resolveCategoryPhoto(category));
  }

  const resolved = new Map();
  for (const [category, promise] of needed) {
    resolved.set(category, await promise);
  }

  for (const place of places) {
    if (place.photos.length) continue;
    const category = shortLabel(place.fields[typeField.key]);
    place.categoryPhoto = resolved.get(category) || null;
  }
  return places;
}

export async function getSchema() {
  const snap = await getDb().collection(META).doc('schema').get();
  return snap.exists ? snap.data() : { fields: [], generatedAt: null };
}

export async function setSchema(schema) {
  await getDb().collection(META).doc('schema').set(schema);
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
    fields,
    visited: !!doc.visited,
    userNotes: doc.userNotes || '',
    photos: doc.photos || [],
    categoryPhoto: null,
    coords: doc.coords || null,
    mapsUrl,
    contact: { phone, telHref: telHref(phone), website },
    createdAt: toPlainDate(doc.createdAt),
    updatedAt: toPlainDate(doc.updatedAt),
  };
}

export async function listPlaces() {
  const [schema, snap] = await Promise.all([getSchema(), getDb().collection(PLACES).get()]);
  const places = snap.docs
    .map((d) => decoratePlace({ id: d.id, ...d.data() }, schema))
    .sort((a, b) => {
      const an = (fieldByRole(schema, 'name') && a.fields[fieldByRole(schema, 'name').key]) || '';
      const bn = (fieldByRole(schema, 'name') && b.fields[fieldByRole(schema, 'name').key]) || '';
      return String(an).localeCompare(String(bn));
    });
  return attachCategoryPhotos(places, schema);
}

export async function getPlace(id) {
  const [schema, snap] = await Promise.all([getSchema(), getDb().collection(PLACES).doc(id).get()]);
  if (!snap.exists) return null;
  const place = decoratePlace({ id: snap.id, ...snap.data() }, schema);
  const [decorated] = await attachCategoryPhotos([place], schema);
  return decorated;
}

export async function findByDedupeKey(dedupeKey) {
  const snap = await getDb().collection(PLACES).where('dedupeKey', '==', dedupeKey).limit(1).get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// Upsert used by the xlsx importer. Spreadsheet-sourced fields are overwritten
// with the latest sheet values; app-added state (visited, userNotes, photos)
// is preserved across re-imports.
export async function upsertFromImport({ dedupeKey, fields, coords, mapsUrlRaw, rowNumber }) {
  const admin = getAdmin();
  const existing = await findByDedupeKey(dedupeKey);
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

export async function createPlace({ fields, coords, visited, userNotes }) {
  const admin = getAdmin();
  const now = admin.firestore.FieldValue.serverTimestamp();
  const schema = await getSchema();
  const nameField = fieldByRole(schema, 'name');
  const addressField = fieldByRole(schema, 'address');
  const dedupeKey = buildDedupeKey(
    nameField ? fields[nameField.key] : '',
    addressField ? fields[addressField.key] : ''
  );

  const ref = await getDb()
    .collection(PLACES)
    .add({
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
