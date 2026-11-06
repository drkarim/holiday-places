import { Router } from 'express';
import multer from 'multer';
import { requireApiToken, requireTripEditor, bearerToken } from '../middleware/auth.js';
import { getTrip, createTrip, publicTrip, canEditTrip } from '../lib/trips.js';
import { importWorkbook } from '../importer/importXlsx.js';
import placesRouter from './places.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Sets req.trip for everything under /api/trips/:trip.
export function loadTrip(slugFrom) {
  return async (req, res, next) => {
    try {
      const slug = typeof slugFrom === 'string' ? slugFrom : req.params.trip;
      req.trip = await getTrip(slug);
      if (!req.trip) return res.status(404).json({ error: `Trip "${slug}" not found.` });
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Create a trip (admin only). Responds with the edit key once; only its
// hash is stored, so keep it.
router.post('/', requireApiToken, async (req, res, next) => {
  try {
    const { slug, name, city, country, countryCode, theme } = req.body || {};
    if (!/^[a-z0-9-]{3,40}$/.test(slug || '') || !name || !country) {
      return res.status(400).json({ error: 'Send slug (a-z, 0-9, -), name and country.' });
    }
    const { trip, editKey } = await createTrip({ slug, name, city, country, countryCode, theme });
    res.status(201).json({ trip: publicTrip(trip), editKey });
  } catch (err) {
    next(err);
  }
});

// The trip's name, country, theme and columns. canEdit says whether the
// key sent (if any) unlocks editing, so the app can show or hide edit tools.
router.get('/:trip', loadTrip(), (req, res) => {
  res.json({ ...publicTrip(req.trip), canEdit: canEditTrip(req.trip, bearerToken(req)) });
});

// Upload a spreadsheet (.xlsx, .xls or .csv) into the trip.
router.post('/:trip/import', loadTrip(), requireTripEditor, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Attach the spreadsheet in the "file" field.' });
    const summary = await importWorkbook(req.file.buffer, {
      tripSlug: req.trip.slug,
      sourceName: req.file.originalname,
    });
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

router.use('/:trip/places', loadTrip(), placesRouter);

export default router;
