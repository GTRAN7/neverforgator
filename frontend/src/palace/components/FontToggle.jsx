import { useEffect, useState } from 'react'

// "Aa" button: switches every page to a dyslexia-friendly font (Comic Sans,
// or Comic Neue where it isn't installed). Remembered in this browser via
// <html data-font="comic">, which palace.css uses to swap the --font token.
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

export default function FontToggle() {
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
  return (
    <button
      className="night-toggle font-toggle"
      onClick={toggle}
      aria-pressed={comic}
      aria-label={comic ? 'Use the regular font' : 'Use a dyslexia-friendly font (Comic Sans)'}
      title={comic ? 'Regular font' : 'Dyslexia-friendly font'}
    >
      <span aria-hidden="true">Aa</span>
    </button>
  )
}
