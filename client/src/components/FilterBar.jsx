import React, { useState } from 'react';
import './FilterBar.css';

export function FilterBar({ areas, filters, onChange, hasHalalField, canSortByDistance }) {
  const [open, setOpen] = useState(false);
  const activeCount = [filters.area, filters.halal, filters.visited].filter(Boolean).length;

  return (
    <div className="filter-bar">
      <button className="filter-toggle" onClick={() => setOpen((o) => !o)}>
        ⚙️ Filters {activeCount > 0 ? `(${activeCount})` : ''}
      </button>
      {open && (
        <div className="filter-panel">
          <div className="filter-group">
            <label>Parish / area</label>
            <select
              value={filters.area || ''}
              onChange={(e) => onChange({ ...filters, area: e.target.value || null })}
            >
              <option value="">Any area</option>
              {areas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          {hasHalalField && (
            <div className="filter-group">
              <label>Halal notes</label>
              <div className="segmented">
                {['', 'has', 'none'].map((v) => (
                  <button
                    key={v}
                    className={filters.halal === v || (!filters.halal && v === '') ? 'active' : ''}
                    onClick={() => onChange({ ...filters, halal: v || null })}
                  >
                    {v === '' ? 'Any' : v === 'has' ? 'Has notes' : 'No notes'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="filter-group">
            <label>Visited</label>
            <div className="segmented">
              {['', 'yes', 'no'].map((v) => (
                <button
                  key={v}
                  className={filters.visited === v || (!filters.visited && v === '') ? 'active' : ''}
                  onClick={() => onChange({ ...filters, visited: v || null })}
                >
                  {v === '' ? 'Any' : v === 'yes' ? 'Visited' : 'Not yet'}
                </button>
              ))}
            </div>
          </div>

          {canSortByDistance && (
            <div className="filter-group">
              <label>Sort</label>
              <div className="segmented">
                <button
                  className={!filters.sortByDistance ? 'active' : ''}
                  onClick={() => onChange({ ...filters, sortByDistance: false })}
                >
                  Name
                </button>
                <button
                  className={filters.sortByDistance ? 'active' : ''}
                  onClick={() => onChange({ ...filters, sortByDistance: true })}
                >
                  Nearest
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
