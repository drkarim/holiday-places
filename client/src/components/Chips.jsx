import React from 'react';
import './Chips.css';

export function Chips({ options, active, onToggle, allLabel = 'All' }) {
  return (
    <div className="chips-row">
      <button className={`chip ${!active ? 'chip-active' : ''}`} onClick={() => onToggle(null)}>
        {allLabel}
      </button>
      {options.map((opt) => (
        <button
          key={opt}
          className={`chip ${active === opt ? 'chip-active' : ''}`}
          onClick={() => onToggle(active === opt ? null : opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
