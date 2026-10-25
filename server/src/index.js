import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(repoRoot, '.env') });

import express from 'express';
import cors from 'cors';
import schemaRouter from './routes/schema.js';
import placesRouter from './routes/places.js';
import { getImportStatus } from './lib/placesStore.js';
import { importXlsx } from './importer/importXlsx.js';

const clientDist = path.join(repoRoot, 'client', 'dist');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/schema', schemaRouter);
app.use('/api/places', placesRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error.' });
});

if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

const PORT = process.env.PORT || 3000;

async function maybeRunFirstImport() {
  try {
    const status = await getImportStatus();
    if (status) return;
    const defaultXlsx = path.join(repoRoot, 'data', 'places.xlsx');
    const xlsxPath = process.env.XLSX_PATH ? path.resolve(repoRoot, process.env.XLSX_PATH) : defaultXlsx;
    if (!existsSync(xlsxPath)) {
      console.log(`No prior import found and no file at ${xlsxPath} — skipping first-run import.`);
      return;
    }
    console.log(`First run: importing ${xlsxPath} ...`);
    const summary = await importXlsx(xlsxPath);
    console.log('First-run import complete:', summary);
  } catch (err) {
    console.error('First-run import failed (server will still start):', err.message);
  }
}

app.listen(PORT, async () => {
  console.log(`Holiday Places server listening on port ${PORT}`);
  await maybeRunFirstImport();
});
