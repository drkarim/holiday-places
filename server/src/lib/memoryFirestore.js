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

function snapshotDoc(id, data, collectionName) {
  return {
    id,
    ref: collectionName ? docRef(collectionName, id) : undefined,
    exists: data !== undefined,
    data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
  };
}

function docRef(collectionName, id) {
  return {
    id,
    async get() {
      const map = getCollectionMap(collectionName);
      return snapshotDoc(id, map.get(id), collectionName);
    },
    async set(data, opts = {}) {
      const map = getCollectionMap(collectionName);
      const existing = map.get(id) || {};
      const merged = opts.merge ? { ...existing, ...resolveFieldValues(data) } : resolveFieldValues(data);
      map.set(id, dropDeleted(merged));
    },
    async update(data) {
      const map = getCollectionMap(collectionName);
      if (!map.has(id)) throw new Error(`memoryFirestore: no document ${collectionName}/${id} to update`);
      map.set(id, dropDeleted({ ...map.get(id), ...resolveFieldValues(data) }));
    },
    async delete() {
      getCollectionMap(collectionName).delete(id);
    },
  };
}

function dropDeleted(data) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => !(value && value.__delete)));
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
      return query(name, [], Infinity).get();
    },
    where(field, op, value) {
      return query(name, [[field, op, value]], Infinity);
    },
  };
}

// Chainable equality filters plus limit, evaluated lazily at get().
function query(name, filters, max) {
  return {
    where(field, op, value) {
      return query(name, [...filters, [field, op, value]], max);
    },
    limit(n) {
      return query(name, filters, n);
    },
    count() {
      const self = this;
      return {
        async get() {
          const { docs } = await self.get();
          return { data: () => ({ count: docs.length }) };
        },
      };
    },
    async get() {
      const entries = [...getCollectionMap(name).entries()].filter(([, data]) =>
        filters.every(([field, op, value]) => {
          if (op === '==') return data[field] === value;
          throw new Error(`memoryFirestore: unsupported operator ${op}`);
        })
      );
      const docs = entries.slice(0, max).map(([id, data]) => snapshotDoc(id, data, name));
      return { empty: docs.length === 0, docs };
    },
  };
}

function batch() {
  const ops = [];
  return {
    update(ref, data) {
      ops.push(() => ref.update(data));
    },
    set(ref, data, opts) {
      ops.push(() => ref.set(data, opts));
    },
    async commit() {
      for (const op of ops) await op();
    },
  };
}

export function createMemoryFirestore() {
  return { collection: collectionRef, batch };
}

export const memoryFieldValue = {
  serverTimestamp: () => ({ __serverTimestamp: true }),
  delete: () => ({ __delete: true }),
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
