import React from 'react';
import { useNavigate } from 'react-router-dom';
import { valueByRole, shortLabel, cardName } from '../lib/fieldHelpers.js';
import { MapsButton } from './MapsButton.jsx';
import './PlaceCard.css';

export function PlaceCard({ place, schema, distanceLabel }) {
  const navigate = useNavigate();
  const name = valueByRole(schema, place, 'name') || 'Untitled place';
  const type = shortLabel(valueByRole(schema, place, 'type'));
  const area = valueByRole(schema, place, 'area');
  const sheetDistance = valueByRole(schema, place, 'distance');
  const photo = place.photos?.[0] || place.categoryPhoto;
  const isStockPhoto = !place.photos?.[0] && !!place.categoryPhoto;

  function goToDetail() {
    navigate(`/places/${place.id}`);
  }

  return (
    <div
      className="place-card"
      role="link"
      tabIndex={0}
      onClick={goToDetail}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && goToDetail()}
    >
      <div className="place-card-photo">
        {photo ? (
          <img src={photo.url} alt={name} loading="lazy" />
        ) : (
          <div className="place-card-placeholder">🏝️</div>
        )}
        {isStockPhoto && <span className="stock-photo-badge">Stock photo</span>}
        {place.visited && <span className="visited-badge">Visited</span>}
        {place.pendingSync && <span className="pending-badge">Pending sync</span>}
      </div>
      <div className="place-card-body">
        <h3 title={name}>{cardName(name)}</h3>
        <div className="place-card-meta">
          {type && <span className="place-card-type">{type}</span>}
          {area && <span>· {area}</span>}
        </div>
        {(distanceLabel || sheetDistance) && (
          <div className="place-card-distance">📍 {distanceLabel || sheetDistance}</div>
        )}
        <div className="place-card-actions">
          <MapsButton url={place.mapsUrl} size="small" label="Maps" />
        </div>
      </div>
    </div>
  );
}
