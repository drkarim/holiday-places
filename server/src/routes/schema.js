import { Router } from 'express';
import { getSchema } from '../lib/placesStore.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const schema = await getSchema();
    res.json(schema);
  } catch (err) {
    next(err);
  }
});

export default router;
