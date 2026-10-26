// Downloads every place's photos in the background so they're in the
// service worker's image cache before you lose signal, not just the ones
// you happened to scroll past. Loading them as <img> requests means they
// go through the same cache rule (vite.config.js) as on-screen photos.
const CONCURRENCY = 4;

function photoUrls(places) {
  const urls = new Set();
  for (const place of places) {
    for (const photo of place.photos || []) if (photo.url) urls.add(photo.url);
    if (place.categoryPhoto?.url) urls.add(place.categoryPhoto.url);
  }
  return [...urls];
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = url;
  });
}

export async function warmPhotoCache(places) {
  if (!('serviceWorker' in navigator) || !navigator.onLine) return;
  // Only worth doing once the service worker is there to cache them.
  await navigator.serviceWorker.ready;
  const queue = photoUrls(places);
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length && navigator.onLine) await loadImage(queue.shift());
  });
  await Promise.all(workers);
}
