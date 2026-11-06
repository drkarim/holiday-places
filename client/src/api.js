import { getEditKey } from './lib/tripAccess.js';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, isForm, key } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      ...(isForm || !body ? {} : { 'Content-Type': 'application/json' }),
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {
      // ignore
    }
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return null;
  return res.json();
}

// API calls for one trip. Changes send the trip's edit key, read from this
// phone at call time, so a key saved from an edit link applies immediately.
export function tripApi(slug) {
  const base = `/api/trips/${encodeURIComponent(slug)}`;
  const write = (path, opts = {}) => request(`${base}${path}`, { ...opts, key: getEditKey(slug) });
  return {
    getTrip: () => request(base, { key: getEditKey(slug) }),
    getPlaces: () => request(`${base}/places`),
    createPlace: (payload) => write('/places', { method: 'POST', body: payload }),
    updatePlace: (id, payload) => write(`/places/${id}`, { method: 'PATCH', body: payload }),
    deletePlace: (id) => write(`/places/${id}`, { method: 'DELETE' }),
    addPhotoUrl: (id, url, caption) => write(`/places/${id}/photos`, { method: 'POST', body: { url, caption } }),
    uploadPhoto: (id, file, caption) => {
      const form = new FormData();
      form.append('photo', file);
      if (caption) form.append('caption', caption);
      return write(`/places/${id}/photos/upload`, { method: 'POST', body: form, isForm: true });
    },
    fetchWikimediaPhotos: (id) => write(`/places/${id}/photos/fetch`, { method: 'POST', body: {} }),
    hideGooglePhoto: (id) => write(`/places/${id}/google-match`, { method: 'PUT', body: { none: true } }),
    deletePhoto: (id, photoId) => write(`/places/${id}/photos/${photoId}`, { method: 'DELETE' }),
    importSpreadsheet: (file) => {
      const form = new FormData();
      form.append('file', file);
      return write('/import', { method: 'POST', body: form, isForm: true });
    },
  };
}
