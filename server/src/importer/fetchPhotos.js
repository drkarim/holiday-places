// One-off/bulk helper: fetch a few Wikimedia Commons photos for every place
// that doesn't have any photos yet. Usage: npm run fetch-photos --prefix server
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { listPlaces, addPhoto, getSchema } from '../lib/placesStore.js';
import { fieldByRole } from '../lib/schema.js';
import { searchCommonsPhotos } from '../lib/wikimedia.js';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env') });

async function main() {
  const schema = await getSchema();
  const nameField = fieldByRole(schema, 'name');
  const areaField = fieldByRole(schema, 'area');
  const places = await listPlaces();

  let fetched = 0;
  for (const place of places) {
    if (place.photos.length) continue;
    const name = nameField ? place.fields[nameField.key] : '';
    const area = areaField ? place.fields[areaField.key] : '';
    const query = [name, area].filter(Boolean).join(' ');
    const results = await searchCommonsPhotos(query, 4);
    for (const result of results) {
      await addPhoto(place.id, { id: randomUUID(), ...result });
    }
    if (results.length) fetched++;
    console.log(`${name}: ${results.length} photo(s)`);
  }
  console.log(`Done. Added photos for ${fetched} place(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('fetch-photos failed:', err.message);
    process.exit(1);
  });
