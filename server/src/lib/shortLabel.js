// Mirrors client/src/lib/fieldHelpers.js's shortLabel() — kept here too so the
// server can key the category-photo cache the same way the client displays
// chips/cards. See that file for the rationale.
export function shortLabel(text, maxWords = 3) {
  if (!text) return text;
  const clause = String(text).split(/\s*[(/,;+]\s*/)[0].trim();
  const words = clause.split(/\s+/).filter(Boolean);
  const short = words.length > maxWords ? words.slice(0, maxWords).join(' ') : clause;
  return short || String(text).trim();
}
