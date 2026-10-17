import { useEffect, useRef, useState } from 'react';
import { usePrefs } from '../lib/prefs.js';
import { FONTS, TEXT_SIZES, useDisplay } from '../lib/display.js';

// The avatar in the header: a menu with preferences, the tour and log out.
export default function AccountMenu({ account }) {
  const [open, setOpen] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const box = useRef(null);
  const user = account?.user;

  // Click anywhere else (or Escape) closes the menu.
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [open]);

  // Auth0's "name" is often just an email or a single letter; the nickname (email prefix) reads better then.
  const fullName = user?.name && user.name.length > 1 && !user.name.includes('@') ? user.name : user?.nickname;
  const name = user?.given_name || fullName?.split(/[\s@._]/)[0] || 'You';
  const initial = name[0]?.toUpperCase() ?? '?';
  // Gravatar's default is a grey blank; our gator-green initial looks better.
  const [photoFailed, setPhotoFailed] = useState(false);
  const photo = user?.picture && !user.picture.includes('gravatar.com') && !photoFailed ? user.picture : null;

  return (
    <div className="account-menu" ref={box}>
      <button className="account-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {photo
          ? <img src={photo} alt="" referrerPolicy="no-referrer" onError={() => setPhotoFailed(true)} />
          : <span className="avatar">{initial}</span>}
        <span className="account-name">{name}</span>
        <span className="chev" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="card-menu account-dropdown" role="menu">
          <div className="account-who">
            <strong>{fullName ?? 'Local user'}</strong>
            {user?.email && <span>{user.email}</span>}
          </div>
          <button role="menuitem" onClick={() => { setOpen(false); setShowPrefs(true); }}>Settings</button>
          <button role="menuitem" onClick={() => { setOpen(false); window.location.hash = '#/guide'; }}>Take the tour again</button>
          {account && <button role="menuitem" className="danger" onClick={account.logout}>Log out</button>}
        </div>
      )}
      {showPrefs && <PrefsModal onClose={() => setShowPrefs(false)} />}
    </div>
  );
}

const CHOICES = {
  style: {
    label: 'Default picture style',
    options: [['storybook', 'Storybook'], ['claymation', 'Claymation'], ['sticker', 'Sticker'], ['pixel', 'Pixel art']],
  },
  flavor: {
    label: 'How weird should scenes get?',
    hint: 'Weirder sticks better. Classroom-safe keeps it PG for studying with friends.',
    options: [['wild', 'Wild'], ['silly', 'Just silly'], ['clean', 'Classroom-safe']],
  },
  quiz: {
    label: 'Quiz me by…',
    options: [['mix', 'Both ways'], ['type', 'Typing what’s there'], ['tap', 'Finding where it lives']],
  },
};

// One labeled on/off row.
function Switch({ label, hint, on, onToggle }) {
  return (
    <div className="setting-row">
      <span className="setting-text"><b>{label}</b>{hint && <small>{hint}</small>}</span>
      <button className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={onToggle}>
        <span className="switch-knob" />
      </button>
    </div>
  );
}

// Settings: how the app looks (shared with campus mode) and how you study.
function PrefsModal({ onClose }) {
  const [prefs, update] = usePrefs();
  const [display, setDisplay] = useDisplay();
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="prefs-card" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <div className="feed-head">
          <h2 className="card-title big">Settings</h2>
          <button className="round-btn small" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <span className="eyebrow">Display</span>
        <Switch label="Night mode" hint="Dark panels and a night sky with stars" on={display.night}
          onToggle={() => setDisplay({ night: !display.night })} />
        <div className="pref-group">
          <span className="field-label">Font</span>
          <div className="style-row" role="radiogroup" aria-label="Font">
            {FONTS.map(([id, name, hint]) => (
              <button key={id} role="radio" aria-checked={display.font === id} title={hint}
                className={`style-btn font-${id} ${display.font === id ? 'on' : ''}`} onClick={() => setDisplay({ font: id })}>
                {name}
              </button>
            ))}
          </div>
        </div>
        <div className="pref-group">
          <span className="field-label">Text size</span>
          <div className="style-row" role="radiogroup" aria-label="Text size">
            {TEXT_SIZES.map(([id, name], i) => (
              <button key={id} role="radio" aria-checked={display.textSize === id} aria-label={name} title={name}
                className={`style-btn size-btn ${display.textSize === id ? 'on' : ''}`} style={{ fontSize: 12 + i * 3 }}
                onClick={() => setDisplay({ textSize: id })}>
                A
              </button>
            ))}
          </div>
        </div>
        <Switch label="Colorblind-friendly" hint="Blue / amber instead of green / purple, plus ✓ and ! marks"
          on={display.colorblind} onToggle={() => setDisplay({ colorblind: !display.colorblind })} />

        <span className="eyebrow">Studying</span>
        {Object.entries(CHOICES).map(([key, { label, hint, options }]) => (
          <div key={key} className="pref-group">
            <span className="field-label">{label}</span>
            <div className="style-row" role="radiogroup" aria-label={label}>
              {options.map(([value, text]) => (
                <button key={value} role="radio" aria-checked={prefs[key] === value}
                  className={`style-btn ${prefs[key] === value ? 'on' : ''}`} onClick={() => update({ [key]: value })}>
                  {text}
                </button>
              ))}
            </div>
            {hint && <span className="hint-text">{hint}</span>}
          </div>
        ))}
        <div className="pref-group">
          <span className="field-label">Review reminders <span className="chip tiny">soon</span></span>
          <label className="pref-toggle muted">
            <input type="checkbox" disabled /> Email me when a palace is due for review
          </label>
        </div>
        <button className="btn ink" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
