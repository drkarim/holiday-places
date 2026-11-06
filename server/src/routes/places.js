import { Router } from 'express';
import { requireTripEditor } from '../middleware/auth.js';
import { photoLocation } from '../lib/trips.js';
import {
  listPlaces,
  getPlace,
  createPlace,
  updatePlace,
  deletePlace,
  getGoogleLink,
  setGoogleLink,
  placeTripId,
} from '../lib/placesStore.js';
import {
  googlePlacesEnabled,
  findGooglePlace,
  getGooglePhoto,
  forgetGooglePhoto,
  googlePhotoUrl,
} from '../lib/googlePlaces.js';
import { mapRequestToFields, getRoleValue } from '../lib/requestMapping.js';
import photosRouter from './photos.js';

// Mounted under a trip (/api/trips/:trip/places, or /api/places for
// Barbados); req.trip is set before these routes run.
const router = Router();

// A place id from another trip is treated as not found.
async function inTrip(req, res, next) {
  try {
    if ((await placeTripId(req.params.id)) !== req.trip.slug) {
      return res.status(404).json({ error: 'Place not found.' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

router.get('/', async (req, res, next) => {
  try {
    res.json(await listPlaces(req.trip.slug));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const place = await getPlace(req.params.id, req.trip.slug);
    if (!place) return res.status(404).json({ error: 'Place not found.' });
    res.json(place);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireTripEditor, async (req, res, next) => {
  try {
    const schema = req.trip.schema;
    const body = req.body || {};

    const missing = ['name', 'type', 'area'].filter((role) => {
      const value = getRoleValue(body, schema, role);
      return value === undefined || value === null || String(value).trim() === '';
    });
    if (missing.length) {
      return res.status(400).json({
        error: `Missing required field(s): ${missing.join(', ')}.`,
        schemaHint: `GET /api/trips/${req.trip.slug} to see the exact field keys and roles.`,
      });
    }

    const { fields, coords } = mapRequestToFields(body, schema);
    const place = await createPlace({
      tripId: req.trip.slug,
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

router.patch('/:id', requireTripEditor, inTrip, async (req, res, next) => {
  try {
    const schema = req.trip.schema;
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

router.delete('/:id', requireTripEditor, inTrip, async (req, res, next) => {
  try {
    await deletePlace(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// The place's Google Maps photo. Redirects to a short-lived Google image URL,
// so the API key never reaches the browser; the app's service worker caches
// the image under this URL for offline use.
router.get('/:id/google-photo', inTrip, async (req, res, next) => {
  try {
    if (!googlePlacesEnabled()) return res.status(404).end();
    const placeId = (await getGoogleLink(req.params.id))?.placeId;
    if (!placeId) return res.status(404).end();

    let url = null;
    for (let attempt = 0; attempt < 2 && !url; attempt++) {
      const photo = await getGooglePhoto(placeId);
      if (!photo) return res.status(404).end();
      try {
        url = await googlePhotoUrl(photo.name);
      } catch (err) {
        // Photo names expire; drop the cached one and look it up again.
        forgetGooglePhoto(placeId);
        if (attempt) throw err;
      }
    }
    res.set('Cache-Control', 'public, max-age=3600');
    res.redirect(302, url);
  } catch (err) {
    next(err);
  }
});

// Correct the automatic Google match for a place. Body, one of:
//   { "none": true }          show no Google photo for this place
//   { "query": "Kira's Kuisine Bridgetown" }  search Google with this text
//   { "placeId": "ChIJ..." }  use this exact Google place
//   { "reset": true }         forget any override and match automatically
router.put('/:id/google-match', requireTripEditor, inTrip, async (req, res, next) => {
  try {
    const body = req.body || {};
    let google;
    if (body.reset) {
      google = undefined;
    } else if (body.none) {
      google = { placeId: null, manual: true, checkedAt: new Date().toISOString() };
    } else if (body.placeId || body.query) {
      let placeId = body.placeId;
      let googleName = null;
      if (!placeId) {
        if (!googlePlacesEnabled()) return res.status(503).json({ error: 'GOOGLE_PLACES_API_KEY is not set.' });
        const match = await findGooglePlace(
          String(body.query),
          { near: photoLocation(req.trip), country: req.trip.country },
          { strict: false }
        );
        if (!match) return res.status(404).json({ error: `Google found nothing for "${body.query}".` });
        ({ placeId, googleName } = match);
      }
      google = { placeId: String(placeId), googleName, manual: true, checkedAt: new Date().toISOString() };
    } else {
      return res.status(400).json({ error: 'Send one of: none, query, placeId, reset.' });
    }

    const place = await setGoogleLink(req.params.id, google);
    if (!place) return res.status(404).json({ error: 'Place not found.' });
    res.json(place);
  } catch (err) {
    next(err);
  }
});

router.use('/:id/photos', inTrip, photosRouter);

export default router;
