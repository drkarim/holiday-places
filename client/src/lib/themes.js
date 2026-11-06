// Colour themes per trip, named by the trip's `theme` (usually its country).
// Each maps onto the CSS variables in styles.css; Barbados is also the
// stylesheet default, so the first paint before a trip loads matches it.
export const THEMES = {
  // The all-trips page: neutral night blue, so each trip card's own colours
  // stand out.
  home: {
    bg: '#121a29',
    bgElevated: '#1d2738',
    bgCard: '#1a2333',
    textDim: '#a9b4c8',
    accent: '#ffffff',
    accentText: '#121a29',
    secondary: '#ffffff',
    highlight: '#a9c8ff',
    border: '#2c3850',
    chipBg: '#243049',
    overlay: '18, 26, 41',
  },
  // Barbados flag: ultramarine background, gold buttons.
  barbados: {
    bg: '#00267f',
    bgElevated: '#0a3594',
    bgCard: '#07308b',
    textDim: '#c3cff0',
    accent: '#ffc726',
    accentText: '#00267f',
    secondary: '#ffc726',
    highlight: '#ffc726',
    border: '#2b51ad',
    chipBg: '#123d9e',
    overlay: '0, 38, 127',
  },
  // Norway flag: dark blue background, red buttons, white for outlines
  // (red on dark blue is too faint for text).
  norway: {
    bg: '#00205b',
    bgElevated: '#0d3175',
    bgCard: '#0a2a68',
    textDim: '#c5cfe6',
    accent: '#ba0c2f',
    accentText: '#ffffff',
    secondary: '#ffffff',
    highlight: '#ff8a9e',
    border: '#2c4a8c',
    chipBg: '#183a80',
    overlay: '0, 32, 91',
  },
};

const VARS = {
  bg: '--bg',
  bgElevated: '--bg-elevated',
  bgCard: '--bg-card',
  textDim: '--text-dim',
  accent: '--accent',
  accentText: '--accent-text',
  secondary: '--secondary',
  highlight: '--highlight',
  border: '--border',
  chipBg: '--chip-bg',
  overlay: '--overlay',
};

// --- Themes from a trip's own colours (trip.colors, usually its flag's) ---

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

// t = 0 gives a, t = 1 gives b.
function mix(a, b, t) {
  const [x, y] = [rgb(a), rgb(b)];
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

function luminance(hex) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Text and cards are white-on-background, so a light flag colour (e.g.
// Japan's white) is darkened until white text reads well on it. Button
// text, outlines and highlights fall back to white or a lighter tint
// whenever the flag colour would be too faint.
export function themeFromColors({ background, button, buttonText, highlight }) {
  let bg = background;
  for (let i = 0; i < 12 && contrast(bg, '#ffffff') < 7; i++) bg = mix(bg, '#000000', 0.15);
  const bgCard = mix(bg, '#ffffff', 0.04);
  let hi = highlight || button;
  for (let i = 0; i < 8 && contrast(hi, bgCard) < 4.5; i++) hi = mix(hi, '#ffffff', 0.25);
  return {
    bg,
    bgElevated: mix(bg, '#ffffff', 0.07),
    bgCard,
    textDim: mix('#ffffff', bg, 0.25),
    accent: button,
    accentText: buttonText || (contrast(button, '#ffffff') >= 4.5 ? '#ffffff' : bg),
    secondary: contrast(button, bg) >= 3 ? button : '#ffffff',
    highlight: hi,
    border: mix(bg, '#ffffff', 0.18),
    chipBg: mix(bg, '#ffffff', 0.1),
    overlay: rgb(bg).join(', '),
  };
}

// A trip's theme: its built-in preset if it has one, else one made from its
// own colours, else the Barbados colours.
export function themeFor(trip) {
  if (trip?.theme && THEMES[trip.theme]) return THEMES[trip.theme];
  if (trip?.colors?.background && trip.colors.button) return themeFromColors(trip.colors);
  return THEMES.barbados;
}

// Takes a theme name or a theme object (from themeFor).
export function applyTheme(nameOrTheme) {
  const theme = typeof nameOrTheme === 'object' && nameOrTheme ? nameOrTheme : THEMES[nameOrTheme] || THEMES.barbados;
  const root = document.documentElement.style;
  for (const [key, cssVar] of Object.entries(VARS)) root.setProperty(cssVar, theme[key]);
  root.setProperty('--chip-active-bg', theme.accent);
  root.setProperty('--chip-active-text', theme.accentText);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bg);
}
