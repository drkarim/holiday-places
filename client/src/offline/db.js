import { openDB } from 'idb';

const DB_NAME = 'holiday-places';
const DB_VERSION = 1;

let dbPromise;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('places')) {
          db.createObjectStore('places', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta');
        }
        if (!db.objectStoreNames.contains('queue')) {
          db.createObjectStore('queue', { keyPath: 'queueId', autoIncrement: true });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveSchema(schema) {
  const db = await getDb();
  await db.put('meta', schema, 'schema');
}

export async function loadSchema() {
  const db = await getDb();
  return (await db.get('meta', 'schema')) || { fields: [] };
}

export async function saveAllPlaces(places) {
  const db = await getDb();
  const tx = db.transaction('places', 'readwrite');
  await tx.store.clear();
  for (const place of places) await tx.store.put(place);
  await tx.done;
}

export async function savePlace(place) {
  const db = await getDb();
  await db.put('places', place);
}

export async function deletePlaceLocal(id) {
  const db = await getDb();
  await db.delete('places', id);
}

export async function loadAllPlaces() {
  const db = await getDb();
  return db.getAll('places');
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
