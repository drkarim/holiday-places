// Trips: each is a country (and optionally a city) with its own places,
// spreadsheet columns, colour theme and edit key. Seeded from TRIP_SEEDS on
// startup so a new trip is just a new entry here plus a deploy; trips can
// also be created through POST /api/trips with the admin API_TOKEN.
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { getDb } from './firebase.js';
import { buildSchemaFromHeaders } from './schema.js';

const TRIPS = 'trips';
const PLACES = 'places';
const META = 'meta';

// Only the SHA-256 of each edit key is stored; the keys themselves live in
// the organisers' edit links.
const TRIP_SEEDS = [
  {
    slug: 'barbados',
    name: 'Barbados',
    city: null,
    country: 'Barbados',
    countryCode: 'BB',
    theme: 'barbados',
    editKeyHash: '6b5621ee7ece869d52a7862ded25bbdd1990b1ca1b742400b5a0c30f9e892b2e',
  },
  {
    slug: 'tromso-zosy',
    name: 'Tromsø',
    city: 'Tromsø',
    country: 'Norway',
    countryCode: 'NO',
    theme: 'norway',
    editKeyHash: '8caceb2a1d68d0ae9f7973493457a1eb7f8bce6e053c75ec94ac0b2e9e634ddc',
  },
];

// Columns for a trip that has no spreadsheet yet, and for the downloadable
// template (client/public/places-template.csv) — keep the two in step.
export const TEMPLATE_HEADERS = [
  'Name',
  'Type',
  'Area',
  'Address',
  'Google Maps link',
  'Opening hours',
  'Phone / website',
  'Why / what for',
  'Notes',
];

export const LEGACY_TRIP = 'barbados';

export function hashKey(key) {
  return createHash('sha256').update(String(key)).digest('hex');
}

export function newEditKey() {
  return randomBytes(24).toString('base64url');
}

function sameText(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

// True for the trip's own edit key or the admin API_TOKEN.
export function canEditTrip(trip, key) {
  if (!key) return false;
  if (process.env.API_TOKEN && sameText(key, process.env.API_TOKEN)) return true;
  return !!trip?.editKeyHash && sameText(hashKey(key), trip.editKeyHash);
}

// "Tromsø, Norway" — what Google and Commons searches are scoped to.
export function photoLocation(trip) {
  if (!trip) return process.env.PHOTO_LOCATION ?? 'Barbados';
  return trip.city ? `${trip.city}, ${trip.country}` : trip.country;
}

// What a browser may see: everything but the key hash.
export function publicTrip(trip) {
  const { editKeyHash, ...rest } = trip;
  return rest;
}

// Every trip for the app's home page, without columns or key hashes, with
// its number of places. A trip with `listed: false` is left out (reachable
// only by its link).
export async function listTrips() {
  const snap = await getDb().collection(TRIPS).get();
  const trips = snap.docs
    .map((d) => ({ slug: d.id, ...d.data() }))
    .filter((t) => t.listed !== false);
  return Promise.all(
    trips.map(async ({ slug, name, city, country, countryCode, theme }) => {
      const count = await getDb().collection(PLACES).where('tripId', '==', slug).count().get();
      return { slug, name, city, country, countryCode, theme, placeCount: count.data().count };
    })
  );
}

const cache = new Map(); // slug -> { trip, at }
const CACHE_MS = 60 * 1000;

export async function getTrip(slug) {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.trip;
  const snap = await getDb().collection(TRIPS).doc(String(slug)).get();
  const trip = snap.exists ? { slug: snap.id, ...snap.data() } : null;
  cache.set(slug, { trip, at: Date.now() });
  return trip;
}

export async function updateTrip(slug, patch) {
  await getDb().collection(TRIPS).doc(slug).set(patch, { merge: true });
  cache.delete(slug);
  return getTrip(slug);
}

export async function createTrip({ slug, name, city, country, countryCode, theme }) {
  const editKey = newEditKey();
  const ref = getDb().collection(TRIPS).doc(slug);
  if ((await ref.get()).exists) throw Object.assign(new Error(`Trip "${slug}" already exists.`), { status: 409 });
  await ref.set({
    name,
    city: city || null,
    country,
    countryCode: String(countryCode || '').toUpperCase() || null,
    theme: theme || null,
    editKeyHash: hashKey(editKey),
    schema: buildSchemaFromHeaders(TEMPLATE_HEADERS),
    createdAt: new Date().toISOString(),
  });
  cache.delete(slug);
  return { trip: await getTrip(slug), editKey };
}

// Runs on every startup; safe to repeat. Creates/updates the seeded trips,
// gives each a column schema, and moves places from before trips existed
// into the Barbados trip.
export async function ensureTrips() {
  const db = getDb();
  for (const { slug, ...seed } of TRIP_SEEDS) {
    const ref = db.collection(TRIPS).doc(slug);
    const snap = await ref.get();
    const existing = snap.exists ? snap.data() : {};
    const patch = { ...seed };
    if (!existing.schema) {
      const legacy = slug === LEGACY_TRIP ? await db.collection(META).doc('schema').get() : null;
      patch.schema = legacy?.exists ? legacy.data() : buildSchemaFromHeaders(TEMPLATE_HEADERS);
    }
    if (!existing.createdAt) patch.createdAt = new Date().toISOString();
    await ref.set(patch, { merge: true });
    cache.delete(slug);
  }

  const places = await db.collection(PLACES).get();
  const untagged = places.docs.filter((d) => !d.data().tripId);
  for (let i = 0; i < untagged.length; i += 400) {
    const batch = db.batch();
    untagged.slice(i, i + 400).forEach((d) => batch.update(d.ref, { tripId: LEGACY_TRIP }));
    await batch.commit();
  }
  if (untagged.length) console.log(`Moved ${untagged.length} place(s) into the "${LEGACY_TRIP}" trip.`);
}
