import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { requireTripEditor } from '../middleware/auth.js';
import { getPlace, addPhoto, removePhoto } from '../lib/placesStore.js';
import { fieldByRole } from '../lib/schema.js';
import { searchCommonsPhotos } from '../lib/wikimedia.js';
import { getBucket } from '../lib/firebase.js';

const router = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Add a photo by pasting a URL.
router.post('/', requireTripEditor, async (req, res, next) => {
  try {
    const { url, caption } = req.body || {};
    if (!url || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: 'Provide a valid "url".' });
    }
    const photo = { id: randomUUID(), url, source: 'user_url', caption: caption || null };
    const place = await addPhoto(req.params.id, photo);
    if (!place) return res.status(404).json({ error: 'Place not found.' });
    res.status(201).json(place);
  } catch (err) {
    next(err);
  }
});

// Upload a photo file, stored in Firebase Storage.
router.post('/upload', requireTripEditor, upload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Attach a file in the "photo" field.' });

    const place = await getPlace(req.params.id);
    if (!place) return res.status(404).json({ error: 'Place not found.' });

    const bucket = getBucket();
    const ext = (req.file.originalname.match(/\.[a-zA-Z0-9]+$/) || [''])[0];
    const objectPath = `places/${req.params.id}/${randomUUID()}${ext}`;
    const file = bucket.file(objectPath);

    await file.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype },
      public: true,
    });

    const url = `https://storage.googleapis.com/${bucket.name}/${objectPath}`;
    const photo = { id: randomUUID(), url, source: 'upload', caption: req.body?.caption || null };
    const updated = await addPhoto(req.params.id, photo);
    res.status(201).json(updated);
  } catch (err) {
    next(err);
  }
});

// Search Wikimedia Commons for a few photos and attach them.
router.post('/fetch', requireTripEditor, async (req, res, next) => {
  try {
    const place = await getPlace(req.params.id);
    if (!place) return res.status(404).json({ error: 'Place not found.' });

    const schema = req.trip.schema;
    const nameField = fieldByRole(schema, 'name');
    const areaField = fieldByRole(schema, 'area');
    const name = nameField ? place.fields[nameField.key] : '';
    const area = areaField ? place.fields[areaField.key] : '';
    const query = req.body?.query || [name, area].filter(Boolean).join(' ');

    const results = await searchCommonsPhotos(query, 4);
    let updated = place;
    for (const result of results) {
      updated = await addPhoto(req.params.id, { id: randomUUID(), ...result });
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:photoId', requireTripEditor, async (req, res, next) => {
  try {
    const place = await removePhoto(req.params.id, req.params.photoId);
    if (!place) return res.status(404).json({ error: 'Place not found.' });
    res.json(place);
  } catch (err) {
    next(err);
  }
});

export default router;
