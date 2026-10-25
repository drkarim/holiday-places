import { Router } from 'express';
import { requireApiToken } from '../middleware/auth.js';
import {
  getSchema,
  listPlaces,
  getPlace,
  createPlace,
  updatePlace,
  deletePlace,
} from '../lib/placesStore.js';
import { mapRequestToFields, getRoleValue } from '../lib/requestMapping.js';
import photosRouter from './photos.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    res.json(await listPlaces());
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const place = await getPlace(req.params.id);
    if (!place) return res.status(404).json({ error: 'Place not found.' });
    res.json(place);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireApiToken, async (req, res, next) => {
  try {
    const schema = await getSchema();
    const body = req.body || {};

    const missing = ['name', 'type', 'area'].filter((role) => {
      const value = getRoleValue(body, schema, role);
      return value === undefined || value === null || String(value).trim() === '';
    });
    if (missing.length) {
      return res.status(400).json({
        error: `Missing required field(s): ${missing.join(', ')}.`,
        schemaHint: 'GET /api/schema to see the exact field keys and roles.',
      });
    }

    const { fields, coords } = mapRequestToFields(body, schema);
    const place = await createPlace({
      fields,
      coords,
      visited: body.visited,
      userNotes: body.userNotes,
    });
    res.status(201).json(place);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireApiToken, async (req, res, next) => {
  try {
    const schema = await getSchema();
    const body = req.body || {};
    const { fields, coords } = mapRequestToFields(body, schema);

    const patch = {};
    if (Object.keys(fields).length) patch.fields = fields;
    if (coords) patch.coords = coords;
    if (typeof body.visited === 'boolean') patch.visited = body.visited;
    if (typeof body.userNotes === 'string') patch.userNotes = body.userNotes;

    const place = await updatePlace(req.params.id, patch);
    if (!place) return res.status(404).json({ error: 'Place not found.' });
    res.json(place);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireApiToken, async (req, res, next) => {
  try {
    const existing = await getPlace(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Place not found.' });
    await deletePlace(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.use('/:id/photos', photosRouter);

export default router;
