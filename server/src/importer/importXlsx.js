import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import XLSX from 'xlsx';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') });
import { buildSchemaFromHeaders, fieldByRole } from '../lib/schema.js';
import { extractHyperlinkUrl } from '../lib/mapsLink.js';
import { parseCoordsFromMapsUrl } from '../lib/geo.js';
import { buildDedupeKey } from '../lib/dedupeKey.js';
import { setSchema, upsertFromImport, setImportStatus } from '../lib/placesStore.js';
import { updateTrip, LEGACY_TRIP } from '../lib/trips.js';

export async function importXlsx(filePath, tripSlug = LEGACY_TRIP) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return importWorkbook(readFileSync(filePath), { tripSlug, sourceName: path.basename(filePath) });
}

// Imports the first sheet of an .xlsx/.xls/.csv file (as a Buffer) into a
// trip. Re-importing updates rows matched by name + address and keeps each
// place's photos; the sheet's header row becomes the trip's columns.
export async function importWorkbook(buffer, { tripSlug = LEGACY_TRIP, sourceName = null } = {}) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheets = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const rows = ws?.['!ref'] ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) : [];
    const headers = (rows[0] || []).map((h) => (h == null ? '' : String(h).trim()));
    const schema = buildSchemaFromHeaders(headers);
    const missingRoles = ['name', 'type', 'area'].filter((role) => !fieldByRole(schema, role));
    return { ws, rows, schema, missingRoles };
  });
  if (!sheets.some((s) => s.rows.length)) {
    throw Object.assign(new Error('The spreadsheet is empty.'), { status: 400 });
  }
  // Workbooks often open with a notes tab; use the first tab that has the
  // columns we need, falling back to the first tab for the error message.
  const { ws, rows, schema, missingRoles } = sheets.find((s) => !s.missingRoles.length) || sheets[0];
  if (missingRoles.length) {
    throw Object.assign(
      new Error(
        `The first row needs column headings for: ${missingRoles.join(', ')}. ` +
          'Download the template to see the expected headings.'
      ),
      { status: 400 }
    );
  }
  const range = XLSX.utils.decode_range(ws['!ref']);
  await setSchema(schema, tripSlug);

  const rowNumberField = fieldByRole(schema, 'rowNumber');
  const nameField = fieldByRole(schema, 'name');
  const addressField = fieldByRole(schema, 'address');
  const mapsLinkField = fieldByRole(schema, 'mapsLink');
  const latField = fieldByRole(schema, 'lat');
  const lngField = fieldByRole(schema, 'lng');

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (let r = 1; r <= range.e.r; r++) {
    const rowValues = rows[r];
    if (!rowValues || rowValues.every((v) => v === null || v === undefined || v === '')) continue;

    const rowNumber = rowNumberField ? rowValues[schema.fields.indexOf(rowNumberField)] : r;
    const name = nameField ? rowValues[schema.fields.indexOf(nameField)] : null;
    if (!name) {
      skipped++;
      continue;
    }
    const address = addressField ? rowValues[schema.fields.indexOf(addressField)] : null;

    const fields = {};
    schema.fields.forEach((field, colIndex) => {
      fields[field.key] = rowValues[colIndex] ?? null;
    });

    // Resolve the real maps URL, which may be hidden inside a HYPERLINK() formula.
    let mapsUrlRaw = null;
    if (mapsLinkField) {
      const colIndex = schema.fields.indexOf(mapsLinkField);
      const cellAddr = XLSX.utils.encode_cell({ r, c: colIndex });
      const cell = ws[cellAddr];
      if (cell) {
        mapsUrlRaw = extractHyperlinkUrl(cell.f) || (/^https?:\/\//i.test(cell.v) ? cell.v : null);
      }
    }

    let coords = null;
    if (latField && lngField) {
      const lat = parseFloat(rowValues[schema.fields.indexOf(latField)]);
      const lng = parseFloat(rowValues[schema.fields.indexOf(lngField)]);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) coords = { lat, lng };
    }
    if (!coords && mapsUrlRaw) {
      coords = parseCoordsFromMapsUrl(mapsUrlRaw);
    }

    const dedupeKey = buildDedupeKey(name, address);
    const result = await upsertFromImport({ tripId: tripSlug, dedupeKey, fields, coords, mapsUrlRaw, rowNumber });
    if (result.created) created++;
    else updated++;
  }

  const status = { importedAt: new Date().toISOString(), sourceFile: sourceName, created, updated, skipped };
  if (tripSlug === LEGACY_TRIP) await setImportStatus(status);
  await updateTrip(tripSlug, { lastImport: status });

  return { created, updated, skipped, totalFields: schema.fields.length };
}

// Allow running directly:
//   node src/importer/importXlsx.js [--trip <slug>] [path/to/file.xlsx]
const isMain = process.argv[1] && process.argv[1].endsWith('importXlsx.js');
if (isMain) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const args = process.argv.slice(2);
  const tripFlag = args.indexOf('--trip');
  const tripSlug = tripFlag >= 0 ? args.splice(tripFlag, 2)[1] : LEGACY_TRIP;
  const cliArg = args[0];
  const filePath = cliArg
    ? path.resolve(process.cwd(), cliArg)
    : path.resolve(repoRoot, process.env.XLSX_PATH || 'data/places.xlsx');
  importXlsx(filePath, tripSlug)
    .then((summary) => {
      console.log('Import complete:', summary);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Import failed:', err.message);
      process.exit(1);
    });
}
