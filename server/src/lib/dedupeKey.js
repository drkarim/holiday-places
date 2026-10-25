// Stable key used to upsert a place on re-import without creating duplicates.
export function buildDedupeKey(name, address) {
  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return `${norm(name)}|${norm(address)}`;
}
