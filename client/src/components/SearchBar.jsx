import React from 'react';
import './SearchBar.css';

export function SearchBar({ value, onChange }) {
  return (
    <div className="search-bar">
      <span className="search-icon">🔎</span>
      <input
        type="search"
        inputMode="search"
        placeholder="Search places, areas, notes…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Search places"
      />
      {value && (
        <button className="search-clear" onClick={() => onChange('')} aria-label="Clear search">
          ✕
        </button>
      )}
    </div>
  );
}
