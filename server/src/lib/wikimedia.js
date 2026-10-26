// Free, no-auth photo search against Wikimedia Commons.
const API = 'https://commons.wikimedia.org/w/api.php';
// Wikimedia rate-limits anonymous clients hard unless they identify
// themselves: https://meta.wikimedia.org/wiki/User-Agent_policy
const HEADERS = { 'User-Agent': 'holiday-places/1.0 (https://github.com/drkarim/holiday-places)' };

async function commonsSearch(search, limit, width) {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: search,
    gsrnamespace: '6', // File namespace
    gsrlimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|mime|size',
    iiurlwidth: String(width),
    format: 'json',
    origin: '*',
  });

  const res = await fetch(`${API}?${params.toString()}`, { headers: HEADERS });
  if (!res.ok) return [];
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return [];

  // Generator results come back keyed by page id, not in rank order.
  return Object.values(pages)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((page) => {
      const info = page.imageinfo?.[0];
      if (!info) return null;
      const mime = info.mime || '';
      if (!mime.startsWith('image/')) return null;
      const artist = info.extmetadata?.Artist?.value?.replace(/<[^>]+>/g, '') || 'Wikimedia Commons';
      return {
        url: info.thumburl || info.url,
        source: 'wikimedia',
        caption: page.title?.replace(/^File:/, '').replace(/\.[a-z]+$/i, '') || null,
        attribution: artist,
        width: info.width,
        height: info.height,
      };
    })
    .filter(Boolean);
}

export async function searchCommonsPhotos(query, limit = 4) {
  if (!query) return [];
  const results = await commonsSearch(query, limit, 1024);
  return results.map(({ width, height, ...photo }) => photo);
}

// Titles that usually mean a photo won't read well as a small landscape card.
const UNSUITABLE_TITLE = /\b(bw|b&w|black and white|monochrome|hdr|panorama|pano|night|interior detail|map|diagram|logo|painting)\b/i;

function suitsCard({ width, height, caption }) {
  if (!width || !height) return false;
  const ratio = width / height;
  return ratio >= 1.3 && ratio <= 2.2 && !UNSUITABLE_TITLE.test(caption || '');
}

function mentions(caption, category) {
  const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return norm(caption).includes(norm(category));
}

// Place names are proper nouns, so match case-sensitively as a whole word:
// "Barbados" but not a café sign reading "BARbados".
function namesPlace(caption, place) {
  const strip = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const escaped = strip(place).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}])${escaped}($|[^\\p{L}])`, 'u').test(strip(caption));
}

// Picks one good-looking photo for a category like "Beach" or "Café".
// With a location, first looks for a photo taken there whose title names
// both ("Miami Beach, Barbados"); Commons has few reviewed images of small
// places, so this tier is a plain search kept honest by the title check.
// Otherwise uses Commons' reviewed "Quality images" (sharp, well exposed,
// no paintings or scans), then a plain search for niche categories.
export async function searchCategoryPhoto(category, location) {
  if (!category) return null;
  const tiers = [];
  if (location) {
    tiers.push({
      search: `${category} ${location} filetype:bitmap filew:>1200`,
      accept: (p) => mentions(p.caption, category) && namesPlace(p.caption, location),
    });
  }
  tiers.push(
    { search: `${category} filetype:bitmap filew:>1600 incategory:Quality_images` },
    { search: `${category} filetype:bitmap filew:>1600` },
  );
  for (const { search, accept } of tiers) {
    const results = (await commonsSearch(search, 10, 1600)).filter(suitsCard);
    // Search matches description text too, so a title naming the category
    // ("…Aquarium…" rather than a fish close-up) is the safer pick.
    const pick = accept
      ? results.find(accept)
      : results.find((p) => mentions(p.caption, category)) || results[0];
    if (pick) {
      const { width, height, ...photo } = pick;
      return photo;
    }
  }
  return null;
}
