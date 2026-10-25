// A tiny in-memory stand-in for the subset of the Firestore Admin SDK this
// app uses. For local development only (USE_MEMORY_DB=true), when installing
// a real emulator/JDK isn't convenient — data is lost when the process exits.
// Production always uses real Firebase (see firebase.js).
import { randomUUID } from 'crypto';

const collections = new Map();

function getCollectionMap(name) {
  if (!collections.has(name)) collections.set(name, new Map());
  return collections.get(name);
}

function snapshotDoc(id, data) {
  return {
    id,
    exists: data !== undefined,
    data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
  };
}

function docRef(collectionName, id) {
  return {
    id,
    async get() {
      const map = getCollectionMap(collectionName);
      return snapshotDoc(id, map.get(id));
    },
    async set(data, opts = {}) {
      const map = getCollectionMap(collectionName);
      const existing = map.get(id) || {};
      const merged = opts.merge ? { ...existing, ...resolveFieldValues(data) } : resolveFieldValues(data);
      map.set(id, merged);
    },
    async delete() {
      getCollectionMap(collectionName).delete(id);
    },
  };
}

function resolveFieldValues(data) {
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = value && value.__serverTimestamp ? new Date() : value;
  }
  return out;
}

function collectionRef(name) {
  return {
    doc(id = randomUUID()) {
      return docRef(name, id);
    },
    async add(data) {
      const id = randomUUID();
      const map = getCollectionMap(name);
      map.set(id, resolveFieldValues(data));
      return { id };
    },
    async get() {
      const map = getCollectionMap(name);
      const docs = [...map.entries()].map(([id, data]) => snapshotDoc(id, data));
      return { docs };
    },
    where(field, op, value) {
      const map = getCollectionMap(name);
      let entries = [...map.entries()];
      entries = entries.filter(([, data]) => {
        if (op === '==') return data[field] === value;
        throw new Error(`memoryFirestore: unsupported operator ${op}`);
      });
      return {
        limit(n) {
          return {
            async get() {
              const docs = entries.slice(0, n).map(([id, data]) => snapshotDoc(id, data));
              return { empty: docs.length === 0, docs };
            },
          };
        },
      };
    },
  };
}

export function createMemoryFirestore() {
  return { collection: collectionRef };
}

export const memoryFieldValue = {
  serverTimestamp: () => ({ __serverTimestamp: true }),
};

export function createMemoryBucket() {
  const files = new Map();
  return {
    name: 'memory-bucket',
    file(objectPath) {
      return {
        async save(buffer, opts = {}) {
          files.set(objectPath, { buffer, opts });
        },
      };
    },
  };
}
