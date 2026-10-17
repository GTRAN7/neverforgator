import { useEffect, useState } from 'react';

// Display settings: night mode, font, text size, colorblind-friendly colors.
// Same localStorage keys as campus mode (src/palace/night.js, fontPref.js), so a choice made in
// one mode carries over to the other. They're applied as attributes on <html>, which index.css uses:
//   data-theme="night"   data-font="default|recursive|comic"   data-text-size="small|default|large|larger"
//   data-colorblind="on"
const KEYS = {
  night: 'uf-mind-palace:night',
  font: 'uf-mind-palace:font',
  textSize: 'uf-mind-palace:text-size',
  colorblind: 'uf-mind-palace:colorblind',
};

export const FONTS = [
  ['default', 'Playful', 'Fredoka + Nunito'],
  ['recursive', 'Casual', 'Recursive (campus mode)'],
  ['comic', 'Dyslexia-friendly', 'Comic Sans / Comic Neue'],
];
export const TEXT_SIZES = [['small', 'Small'], ['default', 'Default'], ['large', 'Large'], ['larger', 'Larger']];

function load(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function readDisplay() {
  const night = load(KEYS.night);
  const font = load(KEYS.font);
  const size = load(KEYS.textSize);
  return {
    // Until you pick, night mode follows the computer's dark-mode setting.
    night: night === null ? window.matchMedia('(prefers-color-scheme: dark)').matches : night === '1',
    font: FONTS.some(([id]) => id === font) ? font : 'default',
    textSize: TEXT_SIZES.some(([id]) => id === size) ? size : 'default',
    colorblind: load(KEYS.colorblind) === 'on',
  };
}

function apply({ night, font, textSize, colorblind }) {
  const root = document.documentElement.dataset;
  root.theme = night ? 'night' : 'day';
  root.font = font;
  root.textSize = textSize;
  root.colorblind = colorblind ? 'on' : 'off';
}

// Before the first paint, so nothing flashes in the wrong theme or font.
apply(readDisplay());

export function useDisplay() {
  const [display, setDisplay] = useState(readDisplay);
  useEffect(() => {
    const sync = () => setDisplay(readDisplay());
    window.addEventListener('display-changed', sync);
    return () => window.removeEventListener('display-changed', sync);
  }, []);
  const update = (change) => {
    const next = { ...readDisplay(), ...change };
    try {
      if ('night' in change) localStorage.setItem(KEYS.night, next.night ? '1' : '0');
      if ('font' in change) localStorage.setItem(KEYS.font, next.font);
      if ('textSize' in change) localStorage.setItem(KEYS.textSize, next.textSize);
      if ('colorblind' in change) localStorage.setItem(KEYS.colorblind, next.colorblind ? 'on' : 'off');
    } catch { /* private mode: only for this visit */ }
    apply(next);
    setDisplay(next);
    window.dispatchEvent(new Event('display-changed'));
  };
  return [display, update];
}
