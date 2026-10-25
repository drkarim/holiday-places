// firebase-admin v12+ uses a modular API (like the client SDK) — the old
// admin.credential.cert()/admin.firestore()/admin.storage() namespaced style
// no longer works under ESM, so we import each piece from its subpath.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { createMemoryFirestore, createMemoryBucket, memoryFieldValue } from './memoryFirestore.js';

let app;
let memoryDb;
let memoryBucket;

// Pasting a PEM private key into a web form (Railway, etc.) reliably mangles
// it — some mix of literal "\n" text and real newlines, depending on how the
// browser's textarea handled the paste. Rather than require an exact format,
// normalize by stripping all whitespace from the base64 body and rebuilding
// clean single-line-body PEM, which every PEM parser accepts.
function normalizePrivateKey(raw) {
  const key = (raw || '').trim().replace(/\\n/g, '\n');
  const match = key.match(/-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/);
  if (!match) return key;
  const body = match[1].replace(/\s+/g, '');
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`;
}

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
    app = initializeApp({ projectId, storageBucket });
  } else {
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        'Missing Firebase credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, ' +
          'FIREBASE_PRIVATE_KEY and FIREBASE_STORAGE_BUCKET, or run against the emulator ' +
          '(FIRESTORE_EMULATOR_HOST).'
      );
    }

    app = initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
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
  return getFirestore(app);
}

export function getBucket() {
  if (useMemoryDb()) {
    if (!memoryBucket) memoryBucket = createMemoryBucket();
    return memoryBucket;
  }
  initApp();
  return getStorage(app).bucket();
}

export function getAdmin() {
  if (useMemoryDb()) {
    return { firestore: { FieldValue: memoryFieldValue } };
  }
  initApp();
  return { firestore: { FieldValue } };
}
