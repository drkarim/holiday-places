import React, { useState } from 'react';
import './PhotoCarousel.css';

// `fallback` replaces the photos if the first one fails to load (a Google
// photo that isn't saved on this phone while Google is unavailable).
export function PhotoCarousel({ photos: given = [], fallback = null }) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const photos = failed && fallback ? [fallback] : given;

  if (!photos.length) {
    return (
      <div className="carousel carousel-placeholder">
        <span>🏝️</span>
      </div>
    );
  }

  const photo = photos[Math.min(index, photos.length - 1)];

  return (
    <div className="carousel">
      <img
        src={photo.url}
        alt={photo.caption || ''}
        onError={fallback && !failed && photo.source === 'google' ? () => setFailed(true) : undefined}
      />
      {photo.isStock && <div className="carousel-stock-badge">Stock photo — not this specific place</div>}
      {photos.length > 1 && (
        <>
          <button
            className="carousel-nav carousel-prev"
            onClick={() => setIndex((i) => (i - 1 + photos.length) % photos.length)}
            aria-label="Previous photo"
          >
            ‹
          </button>
          <button
            className="carousel-nav carousel-next"
            onClick={() => setIndex((i) => (i + 1) % photos.length)}
            aria-label="Next photo"
          >
            ›
          </button>
          <div className="carousel-dots">
            {photos.map((p, i) => (
              <span key={p.id || i} className={i === index ? 'dot dot-active' : 'dot'} />
            ))}
          </div>
        </>
      )}
      {photo.attribution && <div className="carousel-attribution">{photo.attribution}</div>}
    </div>
  );
}
