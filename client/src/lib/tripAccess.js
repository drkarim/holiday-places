// What this phone remembers about trips, in localStorage: the edit key from
// an organiser's edit link, and the trips opened here (so the trips page can
// list them offline before it has ever loaded the full list). Storage can be unavailable (private
// mode), so every access is guarded and the app works without it.
const KEY_PREFIX = 'editKey:';
const KNOWN = 'knownTrips';
export const DEFAULT_TRIP = 'barbados';

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ignore: storage unavailable
  }
}

export function getEditKey(slug) {
  return read(KEY_PREFIX + slug);
}

export function setEditKey(slug, key) {
  write(KEY_PREFIX + slug, key);
}

export function removeEditKey(slug) {
  write(KEY_PREFIX + slug, null);
}

// [{ slug, name, countryCode, theme, colors, openedAt }], most recent first.
export function knownTrips() {
  try {
    return JSON.parse(read(KNOWN) || '[]');
  } catch {
    return [];
  }
}

export function knownTrip(slug) {
  return knownTrips().find((t) => t.slug === slug) || null;
}

export function rememberTrip({ slug, name, countryCode, theme, colors }) {
  const others = knownTrips().filter((t) => t.slug !== slug);
  write(KNOWN, JSON.stringify([{ slug, name, countryCode, theme, colors, openedAt: Date.now() }, ...others]));
}
