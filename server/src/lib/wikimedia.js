// Free, no-auth photo search against Wikimedia Commons.
const API = 'https://commons.wikimedia.org/w/api.php';

export async function searchCommonsPhotos(query, limit = 4) {
  if (!query) return [];
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6', // File namespace
    gsrlimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|mime',
    iiurlwidth: '1024',
    format: 'json',
    origin: '*',
  });

  const res = await fetch(`${API}?${params.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return [];

  return Object.values(pages)
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
      };
    })
    .filter(Boolean);
}
