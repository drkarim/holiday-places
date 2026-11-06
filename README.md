# Holiday Places

A mobile-first PWA for browsing, filtering and adding the places of interest you've
researched for a trip. Search, filter by type/area/halal-notes/visited, open any
place in Google Maps in one tap, and it all keeps working with no signal.

The data model isn't hardcoded: on import, the app reads the header row of your
`.xlsx` and turns each column into a field. Columns are fuzzy-matched to "roles"
(name, type, address, parish/area, Google Maps link, halal notes, opening hours,
phone/website, reason, notes, status/visited) so the UI can give them special
treatment — any other column still shows up as a plain field, nothing is dropped.

## Stack

- **Server**: Node + Express, Firebase Admin SDK (Firestore + Storage), serves the
  built frontend as static files. Single Railway service.
- **Client**: React + Vite PWA (service worker + IndexedDB offline cache).
- **Storage**: Firestore for place data, Firebase Storage for uploaded photos.

## Project layout

```
server/   Express API, xlsx importer, Firebase access
client/   React PWA (Vite)
data/     put your places.xlsx here (gitignored — not committed)
```

## 1. Local development

### Install

```bash
npm run install:all
```

### Configure environment

Copy `.env.example` to `.env` at the repo root and fill it in:

```bash
cp .env.example .env
```

For a quick local test **without** a real Firebase project, set:

```
USE_MEMORY_DB=true
```

This runs the app against an in-process, non-persistent data store (resets
every time the server restarts) — handy for trying things out before you've
set up Firebase. For anything you want to keep, follow the Firebase setup
below and remove `USE_MEMORY_DB`.

### Add your spreadsheet

Put your file at `data/places.xlsx` (this path is gitignored — your data is
never committed). The first row must be the header row; column names can be
anything, they're read dynamically.

### Run it

```bash
npm run dev:server   # http://localhost:3000 (API) — auto-imports data/places.xlsx on first run
npm run dev:client    # http://localhost:5173 (Vite dev server, proxies /api to :3000)
```

Open http://localhost:5173 on your phone (same Wi-Fi) or in a mobile viewport
in your browser.

### Re-importing

Re-run the importer any time you update the spreadsheet — it's safe to run
repeatedly, it upserts by name+address and never creates duplicates. Visited
status and your own notes/photos are preserved across re-imports.

```bash
npm run import                      # imports data/places.xlsx
npm run import -- path/to/other.xlsx  # or a specific file
npm run import -- --trip tromso-zosy tromso.xlsx  # into another trip
```

## 2. Firebase setup (for real data, not the dev memory store)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and
   create a new project (or use an existing one).
2. **Firestore**: Build → Firestore Database → Create database → Start in
   **production mode** → pick a region.
3. **Storage** (optional — only needed for the "upload my own photo" button;
   pasting an image URL and "find photos online" work without it): Build →
   Storage. New projects are on the free **Spark** plan, which no longer lets
   you enable Storage at all — you'll see an "Upgrade project" prompt instead
   of "Get started". Storage needs the pay-as-you-go **Blaze** plan (it has a
   generous free tier — 5GB storage, 1GB/day download — so a personal app like
   this is very unlikely to actually cost anything, but it does require adding
   a payment method). Skip this step entirely if you don't need photo uploads.
4. **Service account**: Project settings (gear icon) → Service accounts →
   Generate new private key. This downloads a JSON file — keep it secret,
   never commit it.
5. From that JSON, fill in your `.env`:
   - `FIREBASE_PROJECT_ID` → `project_id`
   - `FIREBASE_CLIENT_EMAIL` → `client_email`
   - `FIREBASE_PRIVATE_KEY` → `private_key` (keep the `\n`s exactly as they
     appear in the JSON; quotes around the value are optional)
   - `FIREBASE_STORAGE_BUCKET` → only needed if you did step 3. Newer projects
     default to `<project-id>.firebasestorage.app`, not the older
     `.appspot.com` — check the exact name under Storage → Files in the
     console once it's enabled.
6. Remove/unset `USE_MEMORY_DB` so the app uses real Firebase.
7. (Optional but recommended) Deploy the included security rules, which deny
   all direct client access — the app only ever talks to Firestore/Storage
   through this backend using admin credentials:
   ```bash
   npx firebase-tools deploy --only firestore:rules,storage:rules --project <your-project-id>
   ```
8. Run `npm run import` once to load your spreadsheet into Firestore.

## 3. Deploying to Railway

This repo includes a `Dockerfile` and `railway.json` that build the client and
run a single Node service.

1. Push this repo to GitHub (see below), then in Railway: **New Project → Deploy
   from GitHub repo** and pick it.
2. Railway will detect `railway.json` and build with the Dockerfile. Set these
   variables on the service (Settings → Variables):
   - `API_TOKEN` — a long random string: the admin key. It can change any
     trip and create new trips; keep it to your own scripts.
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` — paste it with real newlines or `\n` escapes, Railway
     accepts either
   - `FIREBASE_STORAGE_BUCKET` (only if you've enabled Storage — see §2)
   - `PEXELS_API_KEY` (optional — category stock photos, see "Photos" below)
3. Deploy. Railway gives you a `*.up.railway.app` URL — open it on your phone
   and use "Add to Home Screen".
4. Your Firestore data is independent of Railway — you seed it once locally
   (`npm run import` against your real Firebase project) and the deployed app
   just reads/writes that same database. Railway never needs your `.xlsx`
   file. To load a newer spreadsheet later, run `npm run import` again locally
   (pointed at production Firebase credentials in your local `.env`).

### Trips, view links and edit links

Each trip (Barbados; Tromsø, Norway; …) has its own places, spreadsheet
columns, flag and colours, and lives at `/#/t/<trip>`. There are no accounts:

- **View link** `https://<your-app>/#/t/<trip>`: anyone with it can browse
  the trip offline, mark places visited and keep notes. Visited ticks and
  notes are stored on that phone only and never sent to the server.
- **Edit link** `https://<your-app>/#/t/<trip>/edit/<edit key>`: opening it
  once saves the key on that phone and unlocks adding, editing, deleting,
  photos and spreadsheet import for that trip only.
- **Admin `API_TOKEN`**: works as the edit key for every trip, and is the
  only key that can create trips. It never ships in the app.

Trips are seeded from `TRIP_SEEDS` in `server/src/lib/trips.js` on startup,
which stores only the SHA-256 of each edit key. To add one, either add a seed
(generate a key, put its hash in the seed, deploy) or call the admin API:

```bash
curl -X POST https://<your-app>/api/trips \
  -H "Authorization: Bearer $API_TOKEN" -H "Content-Type: application/json" \
  -d '{"slug": "lisbon-k3x8", "name": "Lisbon", "city": "Lisbon", "country": "Portugal", "countryCode": "PT"}'
# -> { "trip": {...}, "editKey": "..." }   the key is shown only once
```

Colour themes live in `client/src/lib/themes.js` (`barbados`, `norway`);
a trip without a matching theme uses the Barbados colours.

The organiser loads places by opening the edit link and using **Import
spreadsheet** (.xlsx, .xls or .csv; the **Template** button downloads the
expected headings). The first row needs at least Name, Type and Area
columns. Re-importing updates places matched by name and address.

## 4. API reference (for your own scripts/assistant)

Base URL: your Railway URL, or `http://localhost:3000` locally.

All endpoints return JSON. Every trip's API lives under
`/api/trips/<trip>/places`; the examples below use the older `/api/places`
address, which still means the Barbados trip. Writes require
`Authorization: Bearer <key>` with that trip's edit key or the admin
`API_TOKEN`. `GET /api/trips/<trip>` returns the trip's columns (`schema`).

Import a spreadsheet into a trip:

```bash
curl -X POST https://<your-app>.up.railway.app/api/trips/<trip>/import \
  -H "Authorization: Bearer $EDIT_KEY" -F "file=@places.xlsx"
```

### List places

```bash
curl https://<your-app>.up.railway.app/api/places
```

### Get the schema (field keys, labels, roles)

```bash
curl https://<your-app>.up.railway.app/api/schema
```

Use this to see the exact field keys for your spreadsheet's columns — handy
when you want to set a column that doesn't have a dedicated shortcut below.

### Add a place

Required: `name`, `type`, `area`. Everything else is optional. You can also
pass `lat`/`lng`, or `mapsLink` to set an exact Google Maps URL (otherwise one
is built from name + address automatically).

```bash
curl -X POST https://<your-app>.up.railway.app/api/places \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Animal Flower Cave",
    "type": "Attraction",
    "area": "St Lucy",
    "address": "North Point, Barbados",
    "halalNotes": "No food on site, scenery only",
    "reason": "Sea cave with tide pools, good at low tide"
  }'
```

For a column that isn't one of the shortcut fields (`name`, `type`, `area`,
`address`, `halalNotes`, `hours`, `phone`, `website`, `reason`, `notes`), set
it via `fields` using the exact key from `GET /api/schema`:

```bash
curl -X POST https://<your-app>.up.railway.app/api/places \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Animal Flower Cave",
    "type": "Attraction",
    "area": "St Lucy",
    "fields": { "source_s_verified_from": "visitbarbados.org" }
  }'
```

### Update a place (mark visited, add notes, edit any field)

```bash
curl -X PATCH https://<your-app>.up.railway.app/api/places/<id> \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"visited": true, "userNotes": "Went at low tide, worth it"}'
```

### Delete a place

```bash
curl -X DELETE https://<your-app>.up.railway.app/api/places/<id> \
  -H "Authorization: Bearer $API_TOKEN"
```

### Add a photo by URL

```bash
curl -X POST https://<your-app>.up.railway.app/api/places/<id>/photos \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://upload.wikimedia.org/...jpg", "caption": "Cave entrance"}'
```

### Look up free photos from Wikimedia Commons

```bash
curl -X POST https://<your-app>.up.railway.app/api/places/<id>/photos/fetch \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Errors

Validation and auth failures return a JSON body like
`{"error": "Missing required field(s): type, area."}` with a 4xx status.

## 5. Photos

A place's own photos (pasted URL, uploaded, or fetched from Wikimedia) always
take priority. Next comes a `googlePhoto`: the first Google Maps photo of
that exact place, when `GOOGLE_PLACES_API_KEY` is set (Places API (New) on a
Google Cloud project with billing). Each place is matched to its Google
listing once by searching "{name}, {PHOTO_LOCATION}"; the result is stored on
the place as `google`, and a result whose name doesn't resemble ours is
rejected rather than risk showing the wrong business. Only the Google place
ID is stored, as Google's terms require; the image is served through
`GET /api/places/:id/google-photo`, which redirects to Google so the key
stays on the server. To fix a match:

```bash
curl -X PUT https://<your-app>/api/places/<id>/google-match \
  -H "Authorization: Bearer $API_TOKEN" -H "Content-Type: application/json" \
  -d '{"query": "Kira'"'"'s Kuisine Bridgetown"}'   # or {"placeId": "ChIJ..."}, {"none": true}, {"reset": true}
```

The app's detail screen also has a "Wrong place? Hide Google photo" button.

If a place has neither, the API fills in a `categoryPhoto` —
one free stock photo per *category* (its short Type label — "Beach", "Café",
etc.), not a real photo of that specific place. It first looks on Wikimedia
Commons for a photo taken in `PHOTO_LOCATION` (default `Barbados`) whose
title names both the category and the place; otherwise it uses Commons'
reviewed "Quality images" (landscape, sharp, no paintings or scans),
falling back to a plain Commons search for niche categories. No key needed.
If `PEXELS_API_KEY` is set, [Pexels](https://www.pexels.com/api/) is tried
first.

Each category's photo is fetched once and cached in Firestore (`meta/categoryPhotos_v3`)
— the first request after a new category shows up fetches it, every request
after that (and every place sharing that category) is instant from cache. To
force a re-fetch (e.g. you don't like the one it picked), delete that
category's key from the `meta/categoryPhotos_v3` document in the Firestore
console.

## 6. Offline behaviour

- The full place list (all text fields) is mirrored into IndexedDB, so
  search/filter/detail all work with no signal.
- Every place's photos (its own and its category stock photo) are downloaded
  in the background whenever the app opens online, so they show offline even
  if you never scrolled to them. Open the app once on Wi-Fi before heading out.
- Adding a place or editing one while offline queues the change locally (you'll
  see a "pending sync" badge); it's sent automatically once you're back online.
- File uploads and the "find photos online" action need a connection (there's
  no sane way to queue a multi-megabyte photo upload offline) — paste-a-URL and
  all read/edit actions work offline.
- After deploying, it's worth confirming the service worker actually activates
  on your phone (Chrome: `chrome://inspect` or Settings → Site settings; Safari:
  Develop menu) and that a cold reload in airplane mode still loads the app —
  this was built against the standard Workbox/vite-plugin-pwa pattern but
  wasn't verifiable in the sandboxed tool used to build this.

## 7. Known trade-offs

- `xlsx` (SheetJS) has a couple of open high-severity advisories with no fix
  on npm; it's only used to parse a file you control locally (the importer),
  not on untrusted user input, so the risk is low here.
- No login system — see "A note on the API token" above.
