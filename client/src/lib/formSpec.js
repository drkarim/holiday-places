// Builds a dynamic add/edit form (and the API payload for it) straight from
// the schema, so new/renamed spreadsheet columns show up without code changes.
const ROLE_SHORTCUTS = new Set([
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
]);

const REQUIRED_ROLES = new Set(['name', 'type', 'area']);
const HIDDEN_ROLES = new Set(['rowNumber']);
const LONG_ROLES = new Set(['halalNotes', 'hours', 'reason', 'notes', 'sources', 'contact', 'generic']);

export function buildFormSpec(schema) {
  return (schema?.fields || [])
    .filter((f) => !HIDDEN_ROLES.has(f.role))
    .map((field) => {
      if (field.role === 'mapsLink') return { field, kind: 'mapsLink', formKey: 'mapsLink', multiline: false };
      if (field.role === 'lat') return { field, kind: 'lat', formKey: 'lat', multiline: false };
      if (field.role === 'lng') return { field, kind: 'lng', formKey: 'lng', multiline: false };
      if (ROLE_SHORTCUTS.has(field.role)) {
        return {
          field,
          kind: 'role',
          formKey: field.role,
          required: REQUIRED_ROLES.has(field.role),
          multiline: LONG_ROLES.has(field.role),
        };
      }
      return { field, kind: 'generic', formKey: `field:${field.key}`, multiline: LONG_ROLES.has(field.role) };
    });
}

export function initialFormState(schema, place) {
  const spec = buildFormSpec(schema);
  const state = {};
  for (const item of spec) {
    if (item.kind === 'mapsLink') {
      state[item.formKey] = place?.mapsUrlWasRaw ? place.mapsUrl || '' : '';
    } else if (item.kind === 'lat') {
      state[item.formKey] = place?.coords?.lat ?? '';
    } else if (item.kind === 'lng') {
      state[item.formKey] = place?.coords?.lng ?? '';
    } else if (item.kind === 'role') {
      state[item.formKey] = place?.fields?.[item.field.key] ?? '';
    } else {
      state[item.formKey] = place?.fields?.[item.field.key] ?? '';
    }
  }
  return state;
}

export function buildPayload(schema, formState) {
  const spec = buildFormSpec(schema);
  const payload = { fields: {} };

  for (const item of spec) {
    const raw = formState[item.formKey];
    if (item.kind === 'mapsLink') {
      if (raw) payload.mapsLink = raw;
    } else if (item.kind === 'lat') {
      if (raw !== '' && raw !== undefined) payload.lat = parseFloat(raw);
    } else if (item.kind === 'lng') {
      if (raw !== '' && raw !== undefined) payload.lng = parseFloat(raw);
    } else if (item.kind === 'role') {
      payload[item.formKey] = raw;
    } else {
      payload.fields[item.field.key] = raw;
    }
  }
  return payload;
}

export function validate(schema, formState) {
  const spec = buildFormSpec(schema);
  const missing = spec.filter((i) => i.required && !String(formState[i.formKey] || '').trim());
  return missing.map((i) => i.field.label);
}
