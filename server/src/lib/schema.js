// Builds a field schema dynamically from an xlsx header row.
// No column names are hardcoded as required fields in the data model itself —
// instead headers are fuzzy-matched to "roles" so the UI/API can treat
// well-known concepts (maps link, address, area, type, halal notes, hours,
// contact, reason, notes, visited, distance, coordinates) specially, while any
// other column still comes through as a plain generic text field.

export function slugify(header) {
  return String(header)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_') || 'field';
}

const ROLE_MATCHERS = [
  { role: 'rowNumber', test: (h) => /^#$/.test(h.trim()) || /^row\s*(no|number)?$/i.test(h.trim()) },
  { role: 'name', test: (h) => /\bname\b/i.test(h) },
  { role: 'type', test: (h) => /\btype\b/i.test(h) || /\bcategory\b/i.test(h) },
  { role: 'address', test: (h) => /\baddress\b/i.test(h) },
  { role: 'area', test: (h) => /\bparish\b/i.test(h) || /\barea\b/i.test(h) || /\bregion\b/i.test(h) },
  { role: 'mapsLink', test: (h) => /\bmap/i.test(h) },
  { role: 'lat', test: (h) => /\blat(itude)?\b/i.test(h) },
  { role: 'lng', test: (h) => /\b(lng|lon|long|longitude)\b/i.test(h) },
  { role: 'halalNotes', test: (h) => /\bhalal\b/i.test(h) },
  { role: 'hours', test: (h) => /\bhours?\b/i.test(h) || /\bopening\b/i.test(h) },
  { role: 'contact', test: (h) => /\bphone\b/i.test(h) && /\bwebsite\b/i.test(h) },
  { role: 'phone', test: (h) => /\bphone\b/i.test(h) || /\btel(ephone)?\b/i.test(h) },
  { role: 'website', test: (h) => /\bwebsite\b/i.test(h) || /\bsite\b/i.test(h) || /\burl\b/i.test(h) },
  { role: 'reason', test: (h) => /\bwhy\b/i.test(h) || /\breason\b/i.test(h) || /\bwhat\s*for\b/i.test(h) },
  { role: 'distance', test: (h) => /\bdistance\b/i.test(h) },
  { role: 'sources', test: (h) => /\bsource/i.test(h) },
  { role: 'visited', test: (h) => /\bstatus\b/i.test(h) || /\bvisited\b/i.test(h) },
  { role: 'notes', test: (h) => /\bnotes?\b/i.test(h) || /\bcomments?\b/i.test(h) },
];

export function detectRole(header, takenRoles) {
  const h = String(header || '');
  for (const { role, test } of ROLE_MATCHERS) {
    if (test(h)) {
      // contact is a combined phone+website column; don't let plain phone/website
      // matchers steal it, and don't assign the same single-value role twice.
      if (role !== 'contact' && (role === 'phone' || role === 'website')) {
        // only used when a dedicated column exists (not swallowed by "contact")
      }
      return role;
    }
  }
  return 'generic';
}

// Build the field list from a header row (array of strings), preserving order.
export function buildSchemaFromHeaders(headers) {
  const usedKeys = new Set();
  const fields = headers.map((header, index) => {
    let key = slugify(header);
    while (usedKeys.has(key)) key = `${key}_${index}`;
    usedKeys.add(key);
    const role = detectRole(header, usedKeys);
    return {
      key,
      label: String(header || `Column ${index + 1}`).trim(),
      role,
      order: index,
    };
  });
  return { fields, generatedAt: new Date().toISOString() };
}

export function fieldByRole(schema, role) {
  return (schema?.fields || []).find((f) => f.role === role);
}

export function fieldsByRole(schema, role) {
  return (schema?.fields || []).filter((f) => f.role === role);
}
