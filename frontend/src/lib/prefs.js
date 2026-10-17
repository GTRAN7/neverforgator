import { useEffect, useState } from 'react';

// Study preferences, kept in this browser (localStorage). Small enough not to need the server yet.
//   style:  default picture style for new palaces
//   flavor: how wild the scenes get ('wild' | 'silly' | 'clean' for classroom-safe)
//   quiz:   'mix' (both ways) | 'type' (what lives here?) | 'tap' (where did you put it?)
const KEY = 'neverforgator-prefs';
export const DEFAULT_PREFS = { style: 'storybook', flavor: 'wild', quiz: 'mix' };

export function readPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function usePrefs() {
  const [prefs, setPrefs] = useState(readPrefs);
  useEffect(() => {
    const sync = () => setPrefs(readPrefs());
    window.addEventListener('prefs-changed', sync);
    return () => window.removeEventListener('prefs-changed', sync);
  }, []);
  const update = (change) => {
    const next = { ...readPrefs(), ...change };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: only for this visit */ }
    setPrefs(next);
    window.dispatchEvent(new Event('prefs-changed'));
  };
  return [prefs, update];
}
