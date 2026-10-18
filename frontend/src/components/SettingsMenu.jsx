import { useEffect, useRef, useState } from 'react';
import { usePrefs } from '../lib/prefs.js';
import { FONTS, TEXT_SIZES, useDisplay } from '../lib/display.js';
import { switchMode } from '../lib/mode.js';

// Gear button + settings panel, styled like campus mode's (src/palace/components/Settings.jsx) so
// both modes look and work the same. It drops down from the gear instead of opening a full-screen
// window: the headers blur what's behind them, which squeezed a fixed window into the header bar.

const Sun = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="4.5" fill="#fbe7a6" stroke="currentColor" strokeWidth="2" />
    <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const Moon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M15.5 2.5A9.5 9.5 0 1 0 21.5 17 7.6 7.6 0 1 1 15.5 2.5Z" fill="#f4efd9" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);
const Gear = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M10.3 2h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9L2 13.7v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8z"
      fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="3.4" fill="var(--accent)" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const STUDYING = {
  style: {
    label: 'Picture style',
    options: [['storybook', 'Storybook'], ['claymation', 'Claymation'], ['sticker', 'Sticker'], ['pixel', 'Pixel art']],
  },
  flavor: {
    label: 'How weird should scenes get?',
    hint: 'Just silly is the default. Wild can get gross (weirder sticks better); classroom-safe keeps it PG.',
    options: [['silly', 'Just silly'], ['wild', 'Wild'], ['clean', 'Classroom-safe']],
  },
  quiz: {
    label: 'Quiz me by…',
    options: [['mix', 'Both ways'], ['type', 'Typing what’s there'], ['tap', 'Finding where it lives']],
  },
};

// One labeled on/off row, with an icon on the knob.
function Switch({ label, hint, on, onToggle, knob }) {
  return (
    <div className="gear-setting">
      <span className="gear-setting-text"><b>{label}</b>{hint && <small>{hint}</small>}</span>
      <span className="gear-setting-state">{on ? 'On' : 'Off'}</span>
      <button className={`gear-switch ${on ? 'is-on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={onToggle}>
        <span className="gear-switch-knob">{knob}</span>
      </button>
    </div>
  );
}

// A labeled row of choices (fonts, text sizes, study preferences).
function Choices({ label, hint, value, options, onPick, sizes = false }) {
  return (
    <div className="gear-setting stacked">
      <span className="gear-setting-text"><b>{label}</b>{hint && <small>{hint}</small>}</span>
      <div className="gear-chips" role="radiogroup" aria-label={label}>
        {options.map(([id, name], i) => (
          <button key={id} type="button" role="radio" aria-checked={value === id} aria-label={name} title={name}
            className={`gear-chip ${value === id ? 'is-on' : ''} ${sizes ? 'size' : ''}`}
            style={sizes ? { fontSize: 11 + i * 2.5 } : undefined} onClick={() => onPick(id)}>
            {sizes ? 'A' : name}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useDisplay();
  const [prefs, updatePrefs] = usePrefs();
  const box = useRef(null);

  // Click anywhere else (or Escape) closes it.
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div className="gear-menu" ref={box}>
      <button className={`gear-btn ${open ? 'is-open' : ''}`} onClick={() => setOpen((o) => !o)}
        aria-expanded={open} aria-label="Settings" title="Settings">
        <Gear />
      </button>
      {open && (
        <section className="gear-pop" aria-label="Settings">
          <p className="gear-eyebrow">Settings</p>
          <Switch label="Night mode" hint="Dark panels and a night sky with stars" on={display.night}
            onToggle={() => setDisplay({ night: !display.night })} knob={display.night ? <Moon /> : <Sun />} />

          <p className="gear-eyebrow">Studying</p>
          {Object.entries(STUDYING).map(([key, { label, hint, options }]) => (
            <Choices key={key} label={label} hint={hint} value={prefs[key]} options={options}
              onPick={(value) => updatePrefs({ [key]: value })} />
          ))}

          <p className="gear-eyebrow">Accessibility</p>
          <Switch label="Colorblind-friendly" hint="Blue / amber instead of green / purple, plus ✓ and ! marks"
            on={display.colorblind} onToggle={() => setDisplay({ colorblind: !display.colorblind })}
            knob={<span className="gear-knob-cb" aria-hidden="true" />} />
          <Choices label="Font" value={display.font} options={FONTS.map(([id, name]) => [id, name])}
            onPick={(font) => setDisplay({ font })} />
          <Choices label="Text size" hint={TEXT_SIZES.find(([id]) => id === display.textSize)?.[1]} sizes
            value={display.textSize} options={TEXT_SIZES} onPick={(textSize) => setDisplay({ textSize })} />

          <p className="gear-eyebrow">Other mode</p>
          <div className="gear-setting">
            <span className="gear-setting-text"><b>NeverForgator (2D)</b><small>The UF campus walk with photo signs and pins</small></span>
            <button className="btn ghost small" onClick={() => switchMode('campus')}>Open</button>
          </div>

          {/* <div className="gear-setting">
            <span className="gear-setting-text"><b>How it works</b><small>Take the 1-minute tour again</small></span>
            <button className="btn ghost small" onClick={() => { setOpen(false); window.location.hash = '#/guide'; }}>Open</button>
          </div> */}
        </section>
      )}
    </div>
  );
}
