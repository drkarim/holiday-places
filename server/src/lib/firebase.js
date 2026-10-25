import admin from 'firebase-admin';
import { createMemoryFirestore, createMemoryBucket, memoryFieldValue } from './memoryFirestore.js';

let app;
let memoryDb;
let memoryBucket;

// Read lazily (not at module-evaluation time) so a dotenv.config() call that
// runs after this module is first imported still takes effect.
function useMemoryDb() {
  return process.env.USE_MEMORY_DB === 'true';
}

function initApp() {
  if (useMemoryDb() || app) return app;

  const usingEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  const projectId = process.env.FIREBASE_PROJECT_ID || 'holiday-places-dev';
  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    (usingEmulator ? `${projectId}.appspot.com` : undefined);

  if (usingEmulator) {
    // firebase-admin / @google-cloud/firestore pick up FIRESTORE_EMULATOR_HOST
    // and the storage client picks up FIREBASE_STORAGE_EMULATOR_HOST automatically.
    app = admin.initializeApp({ projectId, storageBucket });
  } else {
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        'Missing Firebase credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, ' +
          'FIREBASE_PRIVATE_KEY and FIREBASE_STORAGE_BUCKET, or run against the emulator ' +
          '(FIRESTORE_EMULATOR_HOST).'
      );
    }

    app = admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      storageBucket,
    });
  }

  return app;
}

export function getDb() {
  if (useMemoryDb()) {
    if (!memoryDb) memoryDb = createMemoryFirestore();
    return memoryDb;
  }
  initApp();
  return admin.firestore();
}

export function getBucket() {
  if (useMemoryDb()) {
    if (!memoryBucket) memoryBucket = createMemoryBucket();
    return memoryBucket;
  }
  initApp();
  return admin.storage().bucket();
}

export function getAdmin() {
  if (useMemoryDb()) {
    return { firestore: { FieldValue: memoryFieldValue } };
  }
  initApp();
  return admin;
}
