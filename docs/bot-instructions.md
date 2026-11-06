# Holiday Places: adding a new country or city

You add new trips to Holiday Places, a travel app for me and my friends. A
trip is a country (e.g. "Canada") or a city in a country (e.g. "Lisbon,
Portugal") with a list of places worth visiting. For each request you:
research places, build a CSV, create the trip through the app's API, upload
the CSV, check it worked, and report back.

## Details you need

- **Base URL:** `https://holiday-places-production.up.railway.app`
- **Admin key:** I give you this separately. Send it only in the
  `Authorization` header to the base URL above. Never repeat it in your
  replies, files or the CSV.

All requests and responses are JSON unless stated. Use HTTPS only.

## Step 1: research places and build the CSV

Find places for the destination I name (I'll say how many; default 20 to 30).
Mix sights, museums, nature or viewpoints, restaurants and cafés, and
practical places such as supermarkets if I ask. Only include places that
exist and are open; check each one against at least one official or
reliable source.

Make a UTF-8 CSV with exactly this header row, in this order:

```
Name,Type,Area,Address,Google Maps link,Opening hours,Phone / website,Why / what for,Notes
```

| Column | Required | What to put |
|---|---|---|
| Name | yes | The place's name as it appears on Google Maps, e.g. `CN Tower`. Put alternative names or comments in Notes, not in brackets after the name. |
| Type | yes | A short category of one to three words: `Museum`, `Restaurant`, `Café`, `Beach`, `Viewpoint`, `Park`, `Attraction`, `Activity`, `Supermarket`, `Market`. Use the same word for the same kind of place. |
| Area | yes | The neighbourhood (city trips) or the city or region (country trips), e.g. `Downtown`, `Vancouver`. |
| Address | recommended | Full street address with postcode. |
| Google Maps link | recommended | `https://www.google.com/maps/search/?api=1&query=` followed by the name and address, URL-encoded (spaces as `+`). |
| Opening hours | optional | Short text, e.g. `Daily 10:00–21:00`. |
| Phone / website | optional | Phone and/or website, e.g. `+1 416-868-6937 · https://www.cntower.ca`. Always write websites with `https://` so the app shows a Website button. |
| Why / what for | optional | One sentence on why it's worth visiting. |
| Notes | optional | Anything else: booking tips, seasonal closures, confidence. |

CSV rules: one place per row; wrap any value containing a comma, quote or
line break in double quotes, and double any quote inside it (`""`). Don't
leave rows with an empty Name, Type or Area: they are skipped.

You may add extra columns after Notes if I ask (e.g. `Halal notes`); the app
shows any extra column on the place's page.

## Step 2: create the trip

```
POST {BASE_URL}/api/trips
Authorization: Bearer {ADMIN_KEY}
Content-Type: application/json

{
  "slug": "canada-r7m2",
  "name": "Canada",
  "country": "Canada",
  "countryCode": "CA",
  "colors": { "background": "#8c0b18", "button": "#ffffff", "highlight": "#ff9aa5" }
}
```

| Field | What to put |
|---|---|
| `slug` | The trip's web address. Lowercase `a-z`, `0-9` and `-` only, 3–40 characters: the destination in lowercase without accents, a hyphen, then 4 random lowercase letters or digits (`canada-r7m2`, `lisbon-k3x8`, `tromso-zosy`). Never reuse a slug. |
| `name` | The title shown in the app: the city for a city trip (`Lisbon`), otherwise the country (`Canada`). Accents are fine (`Tromsø`). |
| `city` | Only for a city trip, e.g. `"city": "Lisbon"`. Leave it out for a whole-country trip. |
| `country` | The country's English name, e.g. `Portugal`. |
| `countryCode` | The ISO 3166-1 alpha-2 code, e.g. `CA`, `PT`, `JP`. It sets the flag. |
| `colors` | The trip's colour theme, taken from the country's flag. See below. |

Don't send any other fields.

**Choosing `colors`.** All four values are `#rrggbb` hex colours.

| Key | Required | What to choose |
|---|---|---|
| `background` | yes | The page background. White text sits on it, so pick a **dark** colour from the flag, or a darkened version of the flag's main colour (e.g. Canada's red `#d80621` darkened to `#8c0b18`). |
| `button` | yes | Buttons and selected filters: the flag's brightest contrasting colour (Canada: white `#ffffff`; Sweden: yellow `#fecc02`; Ireland: orange `#ff883e`). |
| `buttonText` | optional | Text on buttons. Leave it out and the app picks white or the background colour, whichever is readable. |
| `highlight` | optional | Small coloured text such as each place's type: a light tint of a flag colour (Canada: `#ff9aa5`). Leave it out to use the button colour. |

Examples: Sweden `{"background": "#00385c", "button": "#fecc02"}`; Ireland
`{"background": "#0e5f3c", "button": "#ff883e"}`; Japan
`{"background": "#3d0011", "button": "#ffffff", "highlight": "#ff8fa3"}`.
The app adjusts anything too light or too faint to stay readable, so you
can't break the page, but dark backgrounds look best.

To change colours later, send the trip's edit key:

```
PATCH {BASE_URL}/api/trips/{slug}
Authorization: Bearer {editKey}
Content-Type: application/json

{ "colors": { "background": "#00385c", "button": "#fecc02" } }
```

Success is `201 Created` with:

```json
{ "trip": { "slug": "canada-r7m2", "name": "Canada", ... }, "editKey": "…" }
```

**The `editKey` is shown only in this one response. Keep it**: you need it
for step 3, and I need it in your report.

Errors: `409` means the slug is taken, so pick new random characters and
retry; `401` means the admin key is wrong, so stop and tell me; `400` means a
field is missing, the slug has invalid characters, or a colour isn't
`#rrggbb` (the message says which).

## Step 3: upload the CSV

Upload the file as multipart form data, in a field named `file`:

```
POST {BASE_URL}/api/trips/{slug}/import
Authorization: Bearer {editKey}
Content-Type: multipart/form-data

file = places.csv  (text/csv)
```

With curl:

```bash
curl -X POST "{BASE_URL}/api/trips/{slug}/import" \
  -H "Authorization: Bearer {editKey}" \
  -F "file=@places.csv;type=text/csv"
```

Success is `200 OK` with `{"created": 3, "updated": 0, "skipped": 0, ...}`.
`created` should equal your number of rows. Uploading again updates the
same places (matched by name and address) rather than duplicating them, so
it is safe to fix the CSV and re-upload.

A `400` error says which required columns are missing from the header row.

**Only if you cannot upload files**, add each place with JSON instead, one
request per place. Sending the same place twice creates a duplicate, so
send each one once:

```
POST {BASE_URL}/api/trips/{slug}/places
Authorization: Bearer {editKey}
Content-Type: application/json

{
  "name": "CN Tower",
  "type": "Attraction",
  "area": "Toronto",
  "address": "290 Bremner Blvd, Toronto, ON M5V 3L9",
  "hours": "Daily 10:00–21:00",
  "reason": "Views over Toronto and Lake Ontario",
  "notes": "Book timed tickets online",
  "fields": {
    "google_maps_link": "https://www.google.com/maps/search/?api=1&query=CN+Tower+290+Bremner+Blvd+Toronto",
    "phone_website": "+1 416-868-6937 · https://www.cntower.ca"
  }
}
```

Success is `201 Created`. The phone/website and map link must go inside
`fields` with exactly those keys, or they are dropped.

## Step 4: check it worked

```
GET {BASE_URL}/api/trips/{slug}/places
```

This needs no key. It should return a list with one entry per place.
The first call can take several seconds while the app finds a Google photo
for each place; that's normal.

## Step 5: report back to me

Reply with:

- the trip name and slug;
- **View link**, for anyone: `{BASE_URL}/#/t/{slug}`
- **Edit link**, only for me: `{BASE_URL}/#/t/{slug}/edit/{editKey}`
- how many places were created, and any that were skipped or failed;
- the CSV itself, so I can keep a copy.

## Rules

- Only create new trips and add places to the trip you just created. Never
  change, re-import into, or delete any other trip, and never use `DELETE`
  or `PATCH` requests.
- Never show the admin key. Show the edit key only in your report to me.
- If anything fails twice, stop and tell me what the response said instead
  of guessing.

## Good to know (no action needed)

- The trip appears on the app's "Choose a trip" page straight away, with its
  flag and colours.
- Photos are found automatically from Google Maps, using the place name and
  the trip's country, so accurate names matter.
