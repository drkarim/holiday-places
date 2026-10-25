// Resolve the best Google Maps URL for a place:
// 1. A real URL already in the maps-link cell (incl. one hidden inside a
//    =HYPERLINK("url","label") formula).
// 2. Known lat/lng coordinates.
// 3. A search built from name + address (or just name).
export function buildMapsSearchUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function resolveMapsLink({ rawUrl, coords, name, address }) {
  if (rawUrl && /^https?:\/\//i.test(rawUrl)) return rawUrl;
  if (coords && typeof coords.lat === 'number' && typeof coords.lng === 'number') {
    return buildMapsSearchUrl(`${coords.lat},${coords.lng}`);
  }
  const parts = [name, address].filter(Boolean);
  if (parts.length) return buildMapsSearchUrl(parts.join(', '));
  return null;
}

// Pull the real URL out of a cell that holds =HYPERLINK("https://...","Open in Google Maps")
export function extractHyperlinkUrl(formula) {
  if (!formula) return null;
  const match = formula.match(/HYPERLINK\(\s*"([^"]+)"/i);
  return match ? match[1] : null;
}
