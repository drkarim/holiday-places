import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { knownTrips } from '../lib/tripAccess.js';

// Wraps the trip title. When this phone has opened more than one trip,
// tapping the title lists the others; otherwise it's just the title.
export function TripSwitcher({ current, children }) {
  const [open, setOpen] = useState(false);
  const others = knownTrips().filter((t) => t.slug !== current);
  if (!others.length) return children;

  return (
    <div className="trip-switcher">
      <button
        className="trip-switcher-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Switch trip"
      >
        {children}
        <span className="trip-switcher-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="trip-switcher-menu">
          {others.map((t) => (
            <li key={t.slug}>
              <Link to={`/t/${t.slug}`} onClick={() => setOpen(false)}>
                {t.name || t.slug}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
