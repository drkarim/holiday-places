// Mirrors client/src/lib/fieldHelpers.js's cardName() — kept here too so the
// server searches Google with the same short name the cards display. See that
// file for the rationale.
export function cardName(text) {
  if (!text) return text;
  let name = String(text);
  let prev;
  do {
    prev = name;
    name = name.replace(/\s*[([][^()[\]]*[)\]]/g, ''); // innermost first
  } while (name !== prev);
  name = name.split(/\s+[-–—]\s+|=/)[0];
  name = name.replace(/[\s,;:(]+$/, '').trim();
  return name || String(text).trim();
}
