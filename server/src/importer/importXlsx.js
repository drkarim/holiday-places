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

export async function importXlsx(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const wb = XLSX.read(readFileSync(filePath), { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const range = XLSX.utils.decode_range(ws['!ref']);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  const headers = rows[0];
  const schema = buildSchemaFromHeaders(headers);
  await setSchema(schema);

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
    const result = await upsertFromImport({ dedupeKey, fields, coords, mapsUrlRaw, rowNumber });
    if (result.created) created++;
    else updated++;
  }

  await setImportStatus({
    importedAt: new Date().toISOString(),
    sourceFile: path.basename(filePath),
    created,
    updated,
    skipped,
  });

  return { created, updated, skipped, totalFields: schema.fields.length };
}

// Allow running directly: `node src/importer/importXlsx.js [path/to/file.xlsx]`
const isMain = process.argv[1] && process.argv[1].endsWith('importXlsx.js');
if (isMain) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const cliArg = process.argv[2];
  const filePath = cliArg
    ? path.resolve(process.cwd(), cliArg)
    : path.resolve(repoRoot, process.env.XLSX_PATH || 'data/places.xlsx');
  importXlsx(filePath)
    .then((summary) => {
      console.log('Import complete:', summary);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Import failed:', err.message);
      process.exit(1);
    });
}
