import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../offline/DataContext.jsx';
import { useGeolocation } from '../hooks/useGeolocation.js';
import { fieldByRole, valueByRole, haversineKm, formatKm, shortLabel } from '../lib/fieldHelpers.js';
import { SearchBar } from '../components/SearchBar.jsx';
import { Chips } from '../components/Chips.jsx';
import { FilterBar } from '../components/FilterBar.jsx';
import { PlaceCard } from '../components/PlaceCard.jsx';
import './Home.css';

export function Home() {
  const { schema, places, loading } = useData();
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
    return (
      <div className="app-shell">
        <div style={{ padding: 24 }}>Loading your places…</div>
      </div>
    );
  }

  return (
    <div className="home-page">
      <div className="home-header">
        <h1>Holiday Places</h1>
        <Link to="/places/new" className="btn btn-primary add-btn" aria-label="Add a place">
          + Add
        </Link>
      </div>
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
      {filtered.length === 0 && (
        <div className="empty-state">No places match. Try clearing a filter or search.</div>
      )}
    </div>
  );
}
