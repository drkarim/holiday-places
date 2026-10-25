import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import * as db from './db.js';

const DataContext = createContext(null);

function tempId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function DataProvider({ children }) {
  const [schema, setSchema] = useState({ fields: [] });
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const flushingRef = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    const queue = await db.getQueue();
    setPendingCount(queue.length);
  }, []);

  const loadFromCache = useCallback(async () => {
    const [cachedSchema, cachedPlaces] = await Promise.all([db.loadSchema(), db.loadAllPlaces()]);
    setSchema(cachedSchema);
    setPlaces(cachedPlaces);
  }, []);

  const refreshFromNetwork = useCallback(async () => {
    const [freshSchema, freshPlaces] = await Promise.all([api.getSchema(), api.getPlaces()]);
    await db.saveSchema(freshSchema);
    await db.saveAllPlaces(freshPlaces);
    setSchema(freshSchema);
    setPlaces(freshPlaces);
    return freshPlaces;
  }, []);

  const flushQueue = useCallback(async () => {
    if (flushingRef.current || !navigator.onLine) return;
    flushingRef.current = true;
    setSyncing(true);
    try {
      let queue = await db.getQueue();
      const idMap = {};
      for (const item of queue) {
        try {
          if (item.type === 'create') {
            const created = await api.createPlace(item.payload);
            idMap[item.tempId] = created.id;
            await db.deletePlaceLocal(item.tempId);
            await db.savePlace(created);
          } else {
            const targetId = idMap[item.targetId] || item.targetId;
            if (item.type === 'update') {
              const updated = await api.updatePlace(targetId, item.payload);
              await db.savePlace(updated);
            } else if (item.type === 'delete') {
              await api.deletePlace(targetId);
              await db.deletePlaceLocal(targetId);
            } else if (item.type === 'photoUrl') {
              const updated = await api.addPhotoUrl(targetId, item.payload.url, item.payload.caption);
              await db.savePlace(updated);
            }
          }
          await db.removeFromQueue(item.queueId);
        } catch (err) {
          console.warn('Sync item failed, will retry later:', err.message);
          break; // keep order; stop at first failure
        }
      }
      const freshPlaces = await db.loadAllPlaces();
      setPlaces(freshPlaces);
      await refreshPendingCount();
    } finally {
      setSyncing(false);
      flushingRef.current = false;
    }
  }, [refreshPendingCount]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await loadFromCache();
      if (navigator.onLine) {
        try {
          await refreshFromNetwork();
        } catch (err) {
          console.warn('Initial network refresh failed, using cache:', err.message);
        }
      }
      if (mounted) setLoading(false);
      await refreshPendingCount();
    })();
    return () => {
      mounted = false;
    };
  }, [loadFromCache, refreshFromNetwork, refreshPendingCount]);

  useEffect(() => {
    const onOnline = async () => {
      setIsOffline(false);
      await flushQueue();
      try {
        await refreshFromNetwork();
      } catch {
        // ignore
      }
    };
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [flushQueue, refreshFromNetwork]);

  const createPlace = useCallback(
    async (payload) => {
      if (navigator.onLine) {
        try {
          const created = await api.createPlace(payload);
          await db.savePlace(created);
          setPlaces((prev) => [...prev, created]);
          return created;
        } catch (err) {
          if (!navigator.onLine) {
            // fall through to offline path below
          } else {
            throw err;
          }
        }
      }
      const id = tempId();
      const optimistic = {
        id,
        fields: { ...payload.fields },
        visited: !!payload.visited,
        userNotes: payload.userNotes || '',
        photos: [],
        mapsUrl: null,
        contact: { phone: null, telHref: null, website: null },
        pendingSync: true,
      };
      await db.savePlace(optimistic);
      await db.enqueue({ type: 'create', tempId: id, payload });
      setPlaces((prev) => [...prev, optimistic]);
      await refreshPendingCount();
      return optimistic;
    },
    [refreshPendingCount]
  );

  const updatePlace = useCallback(
    async (id, payload) => {
      const existing = places.find((p) => p.id === id);
      const optimistic = {
        ...existing,
        ...(payload.fields ? { fields: { ...existing?.fields, ...payload.fields } } : {}),
        ...(typeof payload.visited === 'boolean' ? { visited: payload.visited } : {}),
        ...(typeof payload.userNotes === 'string' ? { userNotes: payload.userNotes } : {}),
      };
      await db.savePlace(optimistic);
      setPlaces((prev) => prev.map((p) => (p.id === id ? optimistic : p)));

      if (navigator.onLine && !id.startsWith('local-')) {
        try {
          const updated = await api.updatePlace(id, payload);
          await db.savePlace(updated);
          setPlaces((prev) => prev.map((p) => (p.id === id ? updated : p)));
          return updated;
        } catch (err) {
          if (navigator.onLine) throw err;
        }
      }
      await db.enqueue({ type: 'update', targetId: id, payload });
      await refreshPendingCount();
      return optimistic;
    },
    [places, refreshPendingCount]
  );

  const deletePlace = useCallback(
    async (id) => {
      setPlaces((prev) => prev.filter((p) => p.id !== id));
      await db.deletePlaceLocal(id);
      if (navigator.onLine && !id.startsWith('local-')) {
        try {
          await api.deletePlace(id);
          return;
        } catch (err) {
          if (navigator.onLine) throw err;
        }
      }
      if (!id.startsWith('local-')) {
        await db.enqueue({ type: 'delete', targetId: id });
        await refreshPendingCount();
      }
    },
    [refreshPendingCount]
  );

  const addPhotoUrl = useCallback(
    async (id, url, caption) => {
      if (navigator.onLine && !id.startsWith('local-')) {
        const updated = await api.addPhotoUrl(id, url, caption);
        await db.savePlace(updated);
        setPlaces((prev) => prev.map((p) => (p.id === id ? updated : p)));
        return updated;
      }
      const existing = places.find((p) => p.id === id);
      const photo = { id: `local-photo-${Date.now()}`, url, source: 'user_url', caption: caption || null };
      const optimistic = { ...existing, photos: [...(existing?.photos || []), photo] };
      await db.savePlace(optimistic);
      setPlaces((prev) => prev.map((p) => (p.id === id ? optimistic : p)));
      await db.enqueue({ type: 'photoUrl', targetId: id, payload: { url, caption } });
      await refreshPendingCount();
      return optimistic;
    },
    [places, refreshPendingCount]
  );

  const applyServerPlace = useCallback(async (place) => {
    await db.savePlace(place);
    setPlaces((prev) => prev.map((p) => (p.id === place.id ? place : p)));
  }, []);

  const value = {
    schema,
    places,
    loading,
    isOffline,
    syncing,
    pendingCount,
    refresh: refreshFromNetwork,
    createPlace,
    updatePlace,
    deletePlace,
    addPhotoUrl,
    applyServerPlace,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
