const API_TOKEN = import.meta.env.VITE_API_TOKEN || '';

async function request(path, { method = 'GET', body, headers, isForm } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(method !== 'GET' ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
      ...headers,
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
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getSchema: () => request('/api/schema'),
  getPlaces: () => request('/api/places'),
  getPlace: (id) => request(`/api/places/${id}`),
  createPlace: (payload) => request('/api/places', { method: 'POST', body: payload }),
  updatePlace: (id, payload) => request(`/api/places/${id}`, { method: 'PATCH', body: payload }),
  deletePlace: (id) => request(`/api/places/${id}`, { method: 'DELETE' }),
  addPhotoUrl: (id, url, caption) =>
    request(`/api/places/${id}/photos`, { method: 'POST', body: { url, caption } }),
  uploadPhoto: (id, file, caption) => {
    const form = new FormData();
    form.append('photo', file);
    if (caption) form.append('caption', caption);
    return request(`/api/places/${id}/photos/upload`, { method: 'POST', body: form, isForm: true });
  },
  fetchWikimediaPhotos: (id) => request(`/api/places/${id}/photos/fetch`, { method: 'POST', body: {} }),
  deletePhoto: (id, photoId) => request(`/api/places/${id}/photos/${photoId}`, { method: 'DELETE' }),
};
