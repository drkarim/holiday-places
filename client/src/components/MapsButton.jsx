import React from 'react';

export function MapsButton({ url, size = 'normal', label = 'Open in Google Maps' }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`btn btn-primary ${size === 'large' ? 'btn-block btn-lg' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      📍 {label}
    </a>
  );
}
