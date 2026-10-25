export function fieldByRole(schema, role) {
  return (schema?.fields || []).find((f) => f.role === role);
}

export function fieldsByRole(schema, role) {
  return (schema?.fields || []).filter((f) => f.role === role);
}

export function valueByRole(schema, place, role) {
  const field = fieldByRole(schema, role);
  if (!field) return undefined;
  return place?.fields?.[field.key];
}

const KNOWN_ROLES = new Set([
  'rowNumber',
  'name',
  'type',
  'address',
  'area',
  'mapsLink',
  'lat',
  'lng',
  'halalNotes',
  'hours',
  'contact',
  'phone',
  'website',
  'reason',
  'distance',
  'sources',
  'visited',
  'notes',
]);

// Any spreadsheet column that didn't map to a role we give special UI to —
// still shown in full on the detail screen so no data from the sheet is lost.
export function genericFields(schema) {
  return (schema?.fields || []).filter((f) => !KNOWN_ROLES.has(f.role) || f.role === 'generic');
}

export function haversineKm(a, b) {
  if (!a || !b) return null;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatKm(km) {
  if (km == null) return null;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}
