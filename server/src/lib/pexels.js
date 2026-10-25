// Free stock photo search (https://www.pexels.com/api/) used to give each
// place-type category a representative photo when no real photos exist yet.
// Pexels' license permits this use without attribution, but we keep the
// photographer credit anyway since it's free to show.
const API = 'https://api.pexels.com/v1/search';

export async function searchStockPhoto(query) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey || !query) return null;

  const params = new URLSearchParams({
    query,
    per_page: '1',
    orientation: 'landscape',
  });

  const res = await fetch(`${API}?${params.toString()}`, {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) return null;

  const data = await res.json();
  const photo = data?.photos?.[0];
  if (!photo) return null;

  return {
    url: photo.src?.large || photo.src?.medium || photo.src?.original,
    attribution: photo.photographer ? `Photo by ${photo.photographer} on Pexels` : 'Pexels',
    sourceUrl: photo.url,
  };
}
