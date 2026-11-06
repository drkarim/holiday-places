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

// Countries without a preset use the Barbados colours for now.
export function applyTheme(name) {
  const theme = THEMES[name] || THEMES.barbados;
  const root = document.documentElement.style;
  for (const [key, cssVar] of Object.entries(VARS)) root.setProperty(cssVar, theme[key]);
  root.setProperty('--chip-active-bg', theme.accent);
  root.setProperty('--chip-active-text', theme.accentText);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bg);
}
