import { openDB } from 'idb';

const DB_NAME = 'holiday-places';
const DB_VERSION = 2;
// Places cached before trips existed were all Barbados.
const LEGACY_TRIP = 'barbados';

let dbPromise;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          db.createObjectStore('places', { keyPath: 'id' });
          db.createObjectStore('meta');
          db.createObjectStore('queue', { keyPath: 'queueId', autoIncrement: true });
        }
        if (oldVersion < 2) {
          tx.objectStore('places').createIndex('tripId', 'tripId');
          // This phone's own visited ticks and notes, never sent to the server.
          db.createObjectStore('personal', { keyPath: 'placeId' }).createIndex('tripId', 'tripId');
          let cursor = await tx.objectStore('places').openCursor();
          while (cursor) {
            if (!cursor.value.tripId) await cursor.update({ ...cursor.value, tripId: LEGACY_TRIP });
            cursor = await cursor.continue();
          }
        }
      },
    });
  }
  return dbPromise;
}

export async function getMeta(key) {
  const db = await getDb();
  return db.get('meta', key);
}

export async function setMeta(key, value) {
  const db = await getDb();
  await db.put('meta', value, key);
}

// The all-trips list, as last fetched, for the home page offline.
export async function saveTripsList(trips) {
  await setMeta('tripsList', trips);
}

export async function loadTripsList() {
  return (await getMeta('tripsList')) || null;
}

// The trip's name, country, theme and columns, as last fetched.
export async function saveTrip(slug, trip) {
  await setMeta(`trip:${slug}`, trip);
}

export async function loadTrip(slug) {
  const trip = await getMeta(`trip:${slug}`);
  if (trip || slug !== LEGACY_TRIP) return trip || null;
  // Phones from before trips kept only Barbados's columns, as "schema".
  const schema = await getMeta('schema');
  return schema ? { slug, name: 'Barbados', country: 'Barbados', countryCode: 'BB', theme: 'barbados', schema } : null;
}

// Replaces this trip's cached places, leaving other trips' untouched.
export async function saveTripPlaces(slug, places) {
  const db = await getDb();
  const tx = db.transaction('places', 'readwrite');
  const oldKeys = await tx.store.index('tripId').getAllKeys(slug);
  for (const key of oldKeys) await tx.store.delete(key);
  for (const place of places) await tx.store.put({ ...place, tripId: slug });
  await tx.done;
}

export async function loadTripPlaces(slug) {
  const db = await getDb();
  return db.getAllFromIndex('places', 'tripId', slug);
}

export async function savePlace(place) {
  const db = await getDb();
  await db.put('places', place);
}

export async function deletePlaceLocal(id) {
  const db = await getDb();
  await db.delete('places', id);
}

// { placeId, tripId, visited, visitedAt, notes }
export async function loadPersonal(slug) {
  const db = await getDb();
  return db.getAllFromIndex('personal', 'tripId', slug);
}

export async function savePersonal(record) {
  const db = await getDb();
  await db.put('personal', record);
}

export async function enqueue(mutation) {
  const db = await getDb();
  return db.add('queue', { ...mutation, createdAt: Date.now() });
}

export async function getQueue() {
  const db = await getDb();
  return db.getAll('queue');
}

export async function removeFromQueue(queueId) {
  const db = await getDb();
  await db.delete('queue', queueId);
}
