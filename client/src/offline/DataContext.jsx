import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { tripApi } from '../api.js';
import * as db from './db.js';
import { warmPhotoCache } from './photoCache.js';
import { getEditKey, removeEditKey, rememberTrip } from '../lib/tripAccess.js';
import { applyTheme, themeFor } from '../lib/themes.js';

const DataContext = createContext(null);
const LEGACY_TRIP = 'barbados';

function tempId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Visited ticks and notes are this phone's own (see db.js "personal"); every
// other change goes to the shared trip on the server.
function splitPayload(payload) {
  const { visited, userNotes, ...shared } = payload;
  const personal = {};
  if (typeof visited === 'boolean') personal.visited = visited;
  if (typeof userNotes === 'string') personal.notes = userNotes;
  return { personal, shared };
}

function isQueuedForTrip(item, slug) {
  return (item.trip || LEGACY_TRIP) === slug;
}

export function DataProvider({ tripSlug, children }) {
  const api = useMemo(() => tripApi(tripSlug), [tripSlug]);
  const [trip, setTrip] = useState(null);
  const [serverPlaces, setServerPlaces] = useState([]);
  const [personal, setPersonalState] = useState({}); // placeId -> record
  // Mirrors `personal` so saves can build on the latest records synchronously.
  const personalRef = useRef({});
  const setPersonal = useCallback((next) => {
    personalRef.current = typeof next === 'function' ? next(personalRef.current) : next;
    setPersonalState(personalRef.current);
  }, []);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [badEditLink, setBadEditLink] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const flushingRef = useRef(false);

  const schema = trip?.schema || { fields: [] };
  const canEdit = !!getEditKey(tripSlug) && trip?.canEdit !== false;

  const places = useMemo(
    () =>
      serverPlaces.map((p) => ({
        ...p,
        visited: !!personal[p.id]?.visited,
        userNotes: personal[p.id]?.notes || '',
      })),
    [serverPlaces, personal]
  );

  const refreshPendingCount = useCallback(async () => {
    const queue = await db.getQueue();
    setPendingCount(queue.filter((item) => isQueuedForTrip(item, tripSlug)).length);
  }, [tripSlug]);

  const showTrip = useCallback(
    (info) => {
      setTrip(info);
      applyTheme(themeFor(info));
      rememberTrip({
        slug: tripSlug,
        name: info.name,
        countryCode: info.countryCode,
        theme: info.theme,
        colors: info.colors,
      });
    },
    [tripSlug]
  );

  const loadFromCache = useCallback(async () => {
    const [cachedTrip, cachedPlaces, personalRows] = await Promise.all([
      db.loadTrip(tripSlug),
      db.loadTripPlaces(tripSlug),
      db.loadPersonal(tripSlug),
    ]);
    if (cachedTrip) showTrip(cachedTrip);
    setServerPlaces(cachedPlaces);
    setPersonal(Object.fromEntries(personalRows.map((r) => [r.placeId, r])));
    return !!cachedTrip;
  }, [tripSlug, showTrip, setPersonal]);

  const savePersonal = useCallback(
    async (placeId, patch) => {
      const record = { placeId, tripId: tripSlug, ...personalRef.current[placeId], ...patch };
      if (patch.visited) record.visitedAt = record.visitedAt || Date.now();
      setPersonal({ ...personalRef.current, [placeId]: record });
      await db.savePersonal(record);
    },
    [tripSlug, setPersonal]
  );

  // Before ticks moved onto phones, Barbados kept them in the shared
  // database. Copy those onto this phone once.
  const adoptSharedTicks = useCallback(
    async (fresh) => {
      if (tripSlug !== LEGACY_TRIP || (await db.getMeta('adoptedSharedTicks'))) return;
      const existing = Object.fromEntries((await db.loadPersonal(tripSlug)).map((r) => [r.placeId, r]));
      const adopted = {};
      for (const p of fresh) {
        if (existing[p.id] || (!p.visited && !p.userNotes)) continue;
        const record = { placeId: p.id, tripId: tripSlug, visited: !!p.visited, notes: p.userNotes || '' };
        await db.savePersonal(record);
        adopted[p.id] = record;
      }
      await db.setMeta('adoptedSharedTicks', true);
      if (Object.keys(adopted).length) setPersonal((prev) => ({ ...adopted, ...prev }));
    },
    [tripSlug, setPersonal]
  );

  const refreshFromNetwork = useCallback(async () => {
    const [info, fresh] = await Promise.all([api.getTrip(), api.getPlaces()]);
    if (getEditKey(tripSlug) && !info.canEdit) {
      removeEditKey(tripSlug);
      setBadEditLink(true);
    }
    await db.saveTrip(tripSlug, info);
    await db.saveTripPlaces(tripSlug, fresh);
    showTrip(info);
    setServerPlaces(fresh);
    setNotFound(false);
    await adoptSharedTicks(fresh);
    warmPhotoCache(fresh); // background; never blocks the UI
    return fresh;
  }, [api, tripSlug, showTrip, adoptSharedTicks]);

  const flushQueue = useCallback(async () => {
    if (flushingRef.current || !navigator.onLine) return;
    flushingRef.current = true;
    setSyncing(true);
    try {
      const queue = (await db.getQueue()).filter((item) => isQueuedForTrip(item, tripSlug));
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
              const { shared } = splitPayload(item.payload);
              if (Object.keys(shared).length) await db.savePlace(await api.updatePlace(targetId, shared));
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
      setServerPlaces(await db.loadTripPlaces(tripSlug));
      await refreshPendingCount();
    } finally {
      setSyncing(false);
      flushingRef.current = false;
    }
  }, [api, tripSlug, refreshPendingCount]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const hadCache = await loadFromCache();
      if (navigator.onLine) {
        try {
          await refreshFromNetwork();
        } catch (err) {
          if (err.status === 404 && !hadCache) setNotFound(true);
          console.warn('Network refresh failed, using cache:', err.message);
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
      const { personal: mine, shared } = splitPayload(payload);
      let created = null;
      if (navigator.onLine) {
        try {
          created = await api.createPlace(shared);
          await db.savePlace({ ...created, tripId: tripSlug });
        } catch (err) {
          if (navigator.onLine) throw err; // otherwise fall through to the offline path
        }
      }
      if (!created) {
        created = {
          id: tempId(),
          tripId: tripSlug,
          fields: { ...shared.fields },
          photos: [],
          mapsUrl: null,
          contact: { phone: null, telHref: null, website: null },
          pendingSync: true,
        };
        await db.savePlace(created);
        await db.enqueue({ type: 'create', trip: tripSlug, tempId: created.id, payload: shared });
        await refreshPendingCount();
      }
      setServerPlaces((prev) => [...prev, created]);
      if (Object.keys(mine).length) await savePersonal(created.id, mine);
      return created;
    },
    [api, tripSlug, refreshPendingCount, savePersonal]
  );

  const updatePlace = useCallback(
    async (id, payload) => {
      const { personal: mine, shared } = splitPayload(payload);
      if (Object.keys(mine).length) await savePersonal(id, mine);
      if (!Object.keys(shared).length) return places.find((p) => p.id === id);

      const existing = serverPlaces.find((p) => p.id === id);
      const optimistic = {
        ...existing,
        ...(shared.fields ? { fields: { ...existing?.fields, ...shared.fields } } : {}),
      };
      await db.savePlace(optimistic);
      setServerPlaces((prev) => prev.map((p) => (p.id === id ? optimistic : p)));

      if (navigator.onLine && !id.startsWith('local-')) {
        try {
          const updated = await api.updatePlace(id, shared);
          await db.savePlace({ ...updated, tripId: tripSlug });
          setServerPlaces((prev) => prev.map((p) => (p.id === id ? updated : p)));
          return updated;
        } catch (err) {
          if (navigator.onLine) throw err;
        }
      }
      await db.enqueue({ type: 'update', trip: tripSlug, targetId: id, payload: shared });
      await refreshPendingCount();
      return optimistic;
    },
    [api, tripSlug, places, serverPlaces, refreshPendingCount, savePersonal]
  );

  const deletePlace = useCallback(
    async (id) => {
      setServerPlaces((prev) => prev.filter((p) => p.id !== id));
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
        await db.enqueue({ type: 'delete', trip: tripSlug, targetId: id });
        await refreshPendingCount();
      }
    },
    [api, tripSlug, refreshPendingCount]
  );

  const addPhotoUrl = useCallback(
    async (id, url, caption) => {
      if (navigator.onLine && !id.startsWith('local-')) {
        const updated = await api.addPhotoUrl(id, url, caption);
        await db.savePlace({ ...updated, tripId: tripSlug });
        setServerPlaces((prev) => prev.map((p) => (p.id === id ? updated : p)));
        return updated;
      }
      const existing = serverPlaces.find((p) => p.id === id);
      const photo = { id: `local-photo-${Date.now()}`, url, source: 'user_url', caption: caption || null };
      const optimistic = { ...existing, photos: [...(existing?.photos || []), photo] };
      await db.savePlace(optimistic);
      setServerPlaces((prev) => prev.map((p) => (p.id === id ? optimistic : p)));
      await db.enqueue({ type: 'photoUrl', trip: tripSlug, targetId: id, payload: { url, caption } });
      await refreshPendingCount();
      return optimistic;
    },
    [api, tripSlug, serverPlaces, refreshPendingCount]
  );

  const applyServerPlace = useCallback(
    async (place) => {
      await db.savePlace({ ...place, tripId: tripSlug });
      setServerPlaces((prev) => prev.map((p) => (p.id === place.id ? place : p)));
    },
    [tripSlug]
  );

  const value = {
    tripSlug,
    trip,
    api,
    schema,
    places,
    loading,
    notFound,
    canEdit,
    badEditLink,
    dismissBadEditLink: () => setBadEditLink(false),
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

// "/places/abc" -> "/t/<this trip>/places/abc"
export function useTripPath() {
  const { tripSlug } = useData();
  return useCallback((path = '') => `/t/${tripSlug}${path}`, [tripSlug]);
}
