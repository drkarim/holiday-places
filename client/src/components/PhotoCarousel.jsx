import React, { useState } from 'react';
import './PhotoCarousel.css';

export function PhotoCarousel({ photos = [] }) {
  const [index, setIndex] = useState(0);

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
      <img src={photo.url} alt={photo.caption || ''} />
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
