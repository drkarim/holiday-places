import { fieldByRole } from './schema.js';

// Convenience role keys a client (the app's own form, or an external caller)
// can send instead of having to know the exact slugified field key.
const ROLE_SHORTCUTS = [
  'name',
  'type',
  'area',
  'address',
  'halalNotes',
  'hours',
  'phone',
  'website',
  'reason',
  'notes',
];

// Turns a friendly request body into a { fields, mapsUrlRaw, coords } patch
// the store can apply. Raw `fields: {...}` entries (by exact schema key)
// always win, so any generic/unmapped column can still be set directly.
export function mapRequestToFields(body, schema) {
  const fields = {};

  for (const role of ROLE_SHORTCUTS) {
    if (body[role] === undefined) continue;
    const field = fieldByRole(schema, role);
    if (field) fields[field.key] = body[role];
  }

  if (body.fields && typeof body.fields === 'object') {
    Object.assign(fields, body.fields);
  }

  let coords;
  if (typeof body.lat === 'number' && typeof body.lng === 'number') {
    coords = { lat: body.lat, lng: body.lng };
  }

  return {
    fields,
    mapsUrlRaw: typeof body.mapsLink === 'string' ? body.mapsLink : undefined,
    coords,
  };
}

export function getRoleValue(body, schema, role) {
  if (body[role] !== undefined) return body[role];
  const field = fieldByRole(schema, role);
  if (field && body.fields && body.fields[field.key] !== undefined) return body.fields[field.key];
  return undefined;
}
