import { useEffect, useState } from 'react'

// Dyslexia-friendly font (Comic Sans, or Comic Neue where it isn't installed).
// Remembered in this browser via <html data-font="comic">, which palace.css
// uses to swap the --font token.
const KEY = 'uf-mind-palace:font'

function saved() {
  try {
    return localStorage.getItem(KEY) === 'comic'
  } catch {
    return false
  }
}

// Apply on load, before any page draws, so text doesn't jump fonts.
document.documentElement.dataset.font = saved() ? 'comic' : 'default'

export function useComicFont() {
  const [comic, setComic] = useState(saved)
  useEffect(() => {
    document.documentElement.dataset.font = comic ? 'comic' : 'default'
  }, [comic])
  const toggle = () => {
    const next = !comic
    setComic(next)
    try {
      localStorage.setItem(KEY, next ? 'comic' : 'default')
    } catch {
      /* storage blocked */
    }
  }
  return [comic, toggle]
}

// Text size: 'small' | 'default' | 'large' | 'larger', via <html data-text-size>,
// which scales every font size in palace.css (--text-scale).
const SIZE_KEY = 'uf-mind-palace:text-size'
export const TEXT_SIZES = [
  ['small', 'Small'],
  ['default', 'Default'],
  ['large', 'Large'],
  ['larger', 'Larger'],
]

function savedSize() {
  try {
    const v = localStorage.getItem(SIZE_KEY)
    return TEXT_SIZES.some(([id]) => id === v) ? v : 'default'
  } catch {
    return 'default'
  }
}

document.documentElement.dataset.textSize = savedSize()

export function useTextSize() {
  const [size, setSize] = useState(savedSize)
  useEffect(() => {
    document.documentElement.dataset.textSize = size
  }, [size])
  const choose = next => {
    setSize(next)
    try {
      localStorage.setItem(SIZE_KEY, next)
    } catch {
      /* storage blocked */
    }
  }
  return [size, choose]
}

// Colorblind-friendly mode: swaps green/red meanings for blue/amber (Okabe–Ito)
// and adds ✓ / ! marks to card pins, via <html data-colorblind="on">.
const CB_KEY = 'uf-mind-palace:colorblind'

function savedColorblind() {
  try {
    return localStorage.getItem(CB_KEY) === 'on'
  } catch {
    return false
  }
}

document.documentElement.dataset.colorblind = savedColorblind() ? 'on' : 'off'

export function useColorblind() {
  const [on, setOn] = useState(savedColorblind)
  useEffect(() => {
    document.documentElement.dataset.colorblind = on ? 'on' : 'off'
  }, [on])
  const toggle = () => {
    const next = !on
    setOn(next)
    try {
      localStorage.setItem(CB_KEY, next ? 'on' : 'off')
    } catch {
      /* storage blocked */
    }
  }
  return [on, toggle]
}
