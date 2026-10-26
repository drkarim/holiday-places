import React from 'react';

// Barbados flag (3:2): ultramarine–gold–ultramarine bands with the black
// broken trident, drawn inline so it stays crisp at any size.
export function BarbadosFlag({ height = 24 }) {
  return (
    <svg
      className="barbados-flag"
      viewBox="0 0 1500 1000"
      height={height}
      width={(height * 3) / 2}
      role="img"
      aria-label="Flag of Barbados"
    >
      <rect width="1500" height="1000" fill="#00267f" />
      <rect x="500" width="500" height="1000" fill="#ffc726" />
      <g fill="#000">
        {/* centre prong */}
        <path d="M750 210 L795 320 L765 305 L765 560 L735 560 L735 305 L705 320 Z" />
        {/* side prongs, curving up from the crossbar */}
        <path d="M735 560 L645 560 Q598 560 588 515 L555 320 L612 385 L628 495 Q634 528 665 528 L735 528 Z" />
        <path d="M765 560 L855 560 Q902 560 912 515 L945 320 L888 385 L872 495 Q866 528 835 528 L765 528 Z" />
        {/* broken-off shaft */}
        <path d="M735 560 L765 560 L765 745 L750 772 L735 740 Z" />
      </g>
    </svg>
  );
}
