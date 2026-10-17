import { useEffect, useRef, useState } from 'react'
import { TEXT_SIZES, useColorblind, useComicFont, useTextSize } from '../fontPref'
import AboutDialog from './AboutDialog'

const Sun = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="4.5" fill="#fbe7a6" stroke="currentColor" strokeWidth="2" />
    <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)
const Moon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M15.5 2.5A9.5 9.5 0 1 0 21.5 17 7.6 7.6 0 1 1 15.5 2.5Z" fill="#f4efd9" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
)
const Gear = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M10.3 2h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9L2 13.7v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8z"
      fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="3.4" fill="var(--accent)" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)

// One labeled on/off row. `knob` can put an icon on the switch's knob.
function Switch({ label, hint, on, onToggle, knob }) {
  return (
    <div className="setting">
      <span className="setting-text">
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
      <span className="setting-state">{on ? 'On' : 'Off'}</span>
      <button className={`switch${on ? ' is-on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={onToggle}>
        <span className="switch-knob">{knob}</span>
      </button>
    </div>
  )
}

// Gear button + panel with the app's preferences. Inside a palace, `signs`
// adds a show/hide switch for its stop signs and `onAppearance` a row that opens Advanced appearance.
export default function Settings({ prefs, signs, onAppearance, className = '' }) {
  const { night, toggleNight } = prefs
  const [open, setOpen] = useState(false)
  const [about, setAbout] = useState(false)

  // The logo (or anything else) can ask for the About dialog.
  useEffect(() => {
    const show = () => { setOpen(false); setAbout(true) }
    addEventListener('uf-mp:about', show)
    return () => removeEventListener('uf-mp:about', show)
  }, [])
  const [comic, toggleComic] = useComicFont()
  const [textSize, setTextSize] = useTextSize()
  const [colorblind, toggleColorblind] = useColorblind()
  const box = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = e => { if (!box.current?.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    addEventListener('pointerdown', onDown)
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('pointerdown', onDown)
      removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`settings ${className}`} ref={box}>
      <button
        className={`settings-btn${open ? ' is-open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label="Settings"
        title="Settings"
      >
        <Gear />
      </button>
      {open && (
        <section className="settings-pop" aria-label="Settings">
          <p className="eyebrow">Settings</p>
          <Switch
            label="Night mode"
            hint="Dark panels, and a night sky unless a palace picks its own"
            on={night}
            onToggle={toggleNight}
            knob={night ? <Moon /> : <Sun />}
          />
          <Switch
            label="Dyslexia-friendly font"
            hint="Comic Sans for all text"
            on={comic}
            onToggle={toggleComic}
            knob={<span className="knob-aa">Aa</span>}
          />
          <Switch
            label="Colorblind-friendly"
            hint="Blue/amber instead of green/red, plus ✓ and ! marks"
            on={colorblind}
            onToggle={toggleColorblind}
            knob={<span className="knob-cb" aria-hidden="true" />}
          />
          <div className="setting">
            <span className="setting-text">
              <b>Text size</b>
              <small>{TEXT_SIZES.find(([id]) => id === textSize)[1]}</small>
            </span>
            <div className="seg-text" role="radiogroup" aria-label="Text size">
              {TEXT_SIZES.map(([id, label], i) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={textSize === id}
                  aria-label={label}
                  title={label}
                  className={`chip${textSize === id ? ' is-on' : ''}`}
                  style={{ fontSize: 11 + i * 2.5 }}
                  onClick={() => setTextSize(id)}
                >
                  A
                </button>
              ))}
            </div>
          </div>
          <div className="setting">
            <span className="setting-text">
              <b>About</b>
              <small>What this is, how to use it, who made it</small>
            </span>
            <button className="btn btn-small btn-ghost" onClick={() => { setOpen(false); setAbout(true) }}>Open</button>
          </div>
          {signs && (
            <Switch
              label="Stop signs"
              hint="Show the sign at each stop in this palace"
              on={signs.on}
              onToggle={signs.toggle}
              knob={<span className="knob-sign" aria-hidden="true" />}
            />
          )}
          {onAppearance && (
            <div className="setting">
              <span className="setting-text">
                <b>Advanced appearance</b>
                <small>Sky, castle, sign colors for this palace</small>
              </span>
              <button className="btn btn-small btn-ghost" onClick={() => { setOpen(false); onAppearance() }}>Open</button>
            </div>
          )}
        </section>
      )}
      {about && <AboutDialog onClose={() => setAbout(false)} />}
    </div>
  )
}
