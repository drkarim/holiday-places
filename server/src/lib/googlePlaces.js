// Google Places API (New): finds a place's Google listing and its photos —
// real owner/visitor photos of that exact place, unlike the category stock
// photos. Needs GOOGLE_PLACES_API_KEY; everything here is a no-op without it.
//
// Google's terms let us store the place ID indefinitely, but not Places
// content such as photo names, so photo details live only in memory below.
const API = 'https://places.googleapis.com/v1';
const PHOTO_TTL_MS = 12 * 60 * 60 * 1000;

export function googlePlacesEnabled() {
  return !!process.env.GOOGLE_PLACES_API_KEY;
}

async function call(path, { method = 'GET', fieldMask, body } = {}) {
  const res = await fetch(`${API}/${path}`, {
    method,
    headers: {
      'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
      ...(fieldMask ? { 'X-Goog-FieldMask': fieldMask } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Places ${res.status}: ${data.error?.message || 'request failed'}`);
  return data;
}

function words(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['the', 'and'].includes(w));
}

// Text search happily returns a different business nearby ("Spicy Flames"
// -> "MR SPICY"), so accept a result only when most of our name is in theirs,
// or all of theirs (two words or more) is in ours: "Carlisle Bay Marine Park"
// -> "Carlisle Bay". Words are compared by their first five letters against
// the other name run together, which tolerates "Food Fanatics" ->
// "Foodfanatics" and "Cuz's" -> "Cuzz".
export function namesResemble(ours, theirs, location) {
  const ignore = new Set(words(location));
  const a = words(ours).filter((w) => !ignore.has(w));
  const b = words(theirs).filter((w) => !ignore.has(w));
  if (!a.length || !b.length) return false;
  const share = (list, other) => {
    const joined = other.join('');
    return list.filter((w) => joined.includes(w.slice(0, 5))).length / list.length;
  };
  return share(a, b) > 0.5 || (b.length >= 2 && share(b, a) === 1);
}

// Returns { placeId, googleName } for a convincing match, null when Google
// has nothing that resembles the name. Throws on API errors so callers don't
// mistake an outage for "no match".
// Pass { strict: false } for a hand-typed search, where the user has already
// decided the result is what they want.
export async function findGooglePlace(name, location, { strict = true } = {}) {
  const data = await call('places:searchText', {
    method: 'POST',
    fieldMask: 'places.id,places.displayName,places.formattedAddress',
    body: { textQuery: location ? `${name}, ${location}` : name, pageSize: 1 },
  });
  const place = data.places?.[0];
  if (!place) return null;
  const googleName = place.displayName?.text || '';
  if (strict && !namesResemble(name, googleName, location)) return null;
  if (location && !String(place.formattedAddress || '').includes(location)) return null;
  return { placeId: place.id, googleName };
}

const photoCache = new Map(); // placeId -> { photo, fetchedAt, pending }

async function fetchFirstPhoto(placeId) {
  const data = await call(`places/${encodeURIComponent(placeId)}`, { fieldMask: 'photos' });
  const photo = data.photos?.[0];
  if (!photo) return null;
  const author = photo.authorAttributions?.[0];
  return { name: photo.name, author: author?.displayName || null, authorUri: author?.uri || null };
}

// First photo of a Google place, or null. Cached in memory and refreshed in
// the background once stale, so lists stay fast after the first call.
export async function getGooglePhoto(placeId) {
  const entry = photoCache.get(placeId);
  // Already fetching: wait for it on a cold cache, else serve the old photo.
  if (entry?.pending) return entry.fetchedAt ? entry.photo : entry.pending;
  if (entry && Date.now() - entry.fetchedAt < PHOTO_TTL_MS) return entry.photo;

  const pending = fetchFirstPhoto(placeId)
    .then((photo) => {
      photoCache.set(placeId, { photo, fetchedAt: Date.now() });
      return photo;
    })
    .catch((err) => {
      console.warn(`Google photo lookup failed for ${placeId}:`, err.message);
      if (entry) photoCache.set(placeId, { ...entry, pending: null });
      else photoCache.delete(placeId);
      return entry?.photo ?? null;
    });
  photoCache.set(placeId, { photo: entry?.photo ?? null, fetchedAt: entry?.fetchedAt ?? 0, pending });
  return entry ? entry.photo : pending;
}

export function forgetGooglePhoto(placeId) {
  photoCache.delete(placeId);
}

// Short-lived image URL (googleusercontent.com) for a photo name.
export async function googlePhotoUrl(photoName, maxWidthPx = 1600) {
  const data = await call(`${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`);
  return data.photoUri;
}
