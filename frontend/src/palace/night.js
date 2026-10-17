import { useEffect, useState } from 'react'

// App-wide night mode: remembered in this browser; the first time it follows
// the computer's dark-mode setting. It sets <html data-theme="night">, which
// switches the color tokens in palace.css.
const KEY = 'uf-mind-palace:night'

function initial() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved !== null) return saved === '1'
  } catch {
    /* storage blocked */
  }
  return matchMedia('(prefers-color-scheme: dark)').matches
}

export function useNightMode() {
  const [night, setNight] = useState(initial)
  useEffect(() => {
    document.documentElement.dataset.theme = night ? 'night' : 'day'
  }, [night])
  // Only a click on the toggle is remembered, so until then it keeps following the system.
  const toggle = () => {
    const next = !night
    setNight(next)
    try {
      localStorage.setItem(KEY, next ? '1' : '0')
    } catch {
      /* storage blocked */
    }
  }
  return [night, toggle]
}
