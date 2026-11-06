import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listTrips } from '../api.js';
import * as db from '../offline/db.js';
import { applyTheme, THEMES } from '../lib/themes.js';
import { knownTrips } from '../lib/tripAccess.js';
import { TripFlag } from '../components/TripFlag.jsx';
import './TripsPage.css';

// The app's front page: every trip as a card in its own colours.
export function TripsPage() {
  const [trips, setTrips] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    applyTheme('home');
    let alive = true;
    (async () => {
      // Saved list first (instant, and offline), then the latest.
      const cached = await db.loadTripsList();
      if (alive && cached) setTrips(cached);
      try {
        const fresh = await listTrips();
        await db.saveTripsList(fresh);
        if (alive) setTrips(fresh);
      } catch {
        // Offline with nothing saved: fall back to trips opened on this phone.
        if (alive && !cached) {
          const known = knownTrips();
          if (known.length) setTrips(known);
          else setFailed(true);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="trips-page">
      <header className="trips-header">
        <h1>Holiday Places</h1>
        <p>Choose a trip</p>
      </header>

      {failed && <div className="empty-state">Connect to the internet once to see the trips.</div>}
      {!trips && !failed && <div className="empty-state">Loading trips…</div>}

      <div className="trip-cards">
        {trips?.map((trip) => {
          const theme = THEMES[trip.theme] || THEMES.barbados;
          return (
            <Link
              key={trip.slug}
              to={`/t/${trip.slug}`}
              className="trip-card"
              style={{ '--card-bg': theme.bg, '--card-accent': theme.accent, '--card-accent-text': theme.accentText }}
            >
              <TripFlag countryCode={trip.countryCode} country={trip.country} height={36} />
              <span className="trip-card-text">
                <span className="trip-card-name">{trip.name}</span>
                <span className="trip-card-meta">
                  {trip.city ? trip.country : 'Whole country'}
                  {typeof trip.placeCount === 'number' && ` · ${trip.placeCount} places`}
                </span>
              </span>
              <span className="trip-card-go" aria-hidden="true">
                Open
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
