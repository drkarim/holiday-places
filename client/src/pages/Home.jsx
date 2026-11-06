import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData, useTripPath } from '../offline/DataContext.jsx';
import { useGeolocation } from '../hooks/useGeolocation.js';
import { fieldByRole, valueByRole, haversineKm, formatKm, shortLabel } from '../lib/fieldHelpers.js';
import { SearchBar } from '../components/SearchBar.jsx';
import { Chips } from '../components/Chips.jsx';
import { FilterBar } from '../components/FilterBar.jsx';
import { PlaceCard } from '../components/PlaceCard.jsx';
import { TripFlag } from '../components/TripFlag.jsx';
import { TripSwitcher } from '../components/TripSwitcher.jsx';
import { OrganiserTools } from '../components/OrganiserTools.jsx';
import './Home.css';

export function Home() {
  const { trip, tripSlug, schema, places, loading, notFound, canEdit, badEditLink, dismissBadEditLink } = useData();
  const tripPath = useTripPath();
  const { position } = useGeolocation();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState(null);
  const [filters, setFilters] = useState({ area: null, halal: null, visited: null, sortByDistance: false });

  const typeField = fieldByRole(schema, 'type');
  const areaField = fieldByRole(schema, 'area');
  const halalField = fieldByRole(schema, 'halalNotes');

  const types = useMemo(() => {
    if (!typeField) return [];
    const labels = places.map((p) => p.fields?.[typeField.key]).filter(Boolean).map((t) => shortLabel(t));
    return [...new Set(labels)].sort();
  }, [places, typeField]);

  const areas = useMemo(() => {
    if (!areaField) return [];
    return [...new Set(places.map((p) => p.fields?.[areaField.key]).filter(Boolean))].sort();
  }, [places, areaField]);

  const withDistance = useMemo(
    () =>
      places.map((p) => ({
        place: p,
        km: position && p.coords ? haversineKm(position, p.coords) : null,
      })),
    [places, position]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = withDistance.filter(({ place }) => {
      if (typeFilter && shortLabel(valueByRole(schema, place, 'type')) !== typeFilter) return false;
      if (filters.area && valueByRole(schema, place, 'area') !== filters.area) return false;
      if (filters.visited === 'yes' && !place.visited) return false;
      if (filters.visited === 'no' && place.visited) return false;
      if (filters.halal) {
        const halal = halalField ? place.fields?.[halalField.key] : null;
        const hasNotes = !!(halal && String(halal).trim());
        if (filters.halal === 'has' && !hasNotes) return false;
        if (filters.halal === 'none' && hasNotes) return false;
      }
      if (q) {
        const haystack = [
          ...Object.values(place.fields || {}),
          place.userNotes,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    if (filters.sortByDistance && position) {
      list = [...list].sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
    } else {
      list = [...list].sort((a, b) => {
        const an = valueByRole(schema, a.place, 'name') || '';
        const bn = valueByRole(schema, b.place, 'name') || '';
        return String(an).localeCompare(String(bn));
      });
    }
    return list;
  }, [withDistance, search, typeFilter, filters, schema, halalField, position]);

  if (loading) {
    return <div style={{ padding: 24 }}>Loading your places…</div>;
  }

  if (notFound) {
    return (
      <div className="empty-state">
        This trip link doesn't work. Check you have the whole link, or ask the trip organiser to send it again.
      </div>
    );
  }

  return (
    <div className="home-page">
      {badEditLink && (
        <div className="notice" role="alert">
          That edit link isn't valid for this trip, so you can view it but not change it.{' '}
          <button className="link-btn" onClick={dismissBadEditLink}>
            OK
          </button>
        </div>
      )}
      <div className="home-header">
        <div className="home-title">
          <TripSwitcher current={tripSlug}>
            <h1>
              {trip?.name || 'Holiday Places'}
              {trip?.city && trip.country && <small className="home-subtitle">{trip.country}</small>}
            </h1>
          </TripSwitcher>
          <TripFlag countryCode={trip?.countryCode} country={trip?.country} height={24} />
        </div>
        {canEdit && (
          <Link to={tripPath('/new')} className="btn btn-primary add-btn" aria-label="Add a place">
            + Add
          </Link>
        )}
      </div>
      {canEdit && <OrganiserTools />}
      <SearchBar value={search} onChange={setSearch} />
      {types.length > 0 && <Chips options={types} active={typeFilter} onToggle={setTypeFilter} />}
      <FilterBar
        areas={areas}
        filters={filters}
        onChange={setFilters}
        hasHalalField={!!halalField}
        canSortByDistance={!!position}
      />
      <div className="results-count">
        {filtered.length} place{filtered.length === 1 ? '' : 's'}
      </div>
      {filtered.map(({ place, km }) => (
        <PlaceCard key={place.id} place={place} schema={schema} distanceLabel={km != null ? formatKm(km) : null} />
      ))}
      {filtered.length === 0 && places.length > 0 && (
        <div className="empty-state">No places match. Try clearing a filter or search.</div>
      )}
      {places.length === 0 && (
        <div className="empty-state">
          {canEdit
            ? 'No places yet. Import a spreadsheet or add places one at a time.'
            : 'No places yet. The trip organiser is still adding them.'}
        </div>
      )}
    </div>
  );
}
