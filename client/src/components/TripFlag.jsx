import React from 'react';
import { BarbadosFlag } from './BarbadosFlag.jsx';

// Every country's flag from flag-icons, emitted as separate files (not
// inlined) so only the flag a trip uses is ever downloaded.
const FLAGS = import.meta.glob('/node_modules/flag-icons/flags/4x3/*.svg', {
  eager: true,
  query: '?no-inline',
  import: 'default',
});

function flagUrl(countryCode) {
  return FLAGS[`/node_modules/flag-icons/flags/4x3/${String(countryCode).toLowerCase()}.svg`] || null;
}

export function TripFlag({ countryCode, country, height = 24 }) {
  if (!countryCode) return null;
  if (countryCode.toUpperCase() === 'BB') return <BarbadosFlag height={height} />;
  const url = flagUrl(countryCode);
  if (!url) return null;
  return (
    <img
      className="trip-flag"
      src={url}
      height={height}
      width={(height * 4) / 3}
      alt={country ? `Flag of ${country}` : ''}
    />
  );
}
