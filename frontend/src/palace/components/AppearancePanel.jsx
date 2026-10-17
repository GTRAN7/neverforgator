import { DEFAULT_LOOK, SIGN_COLORS, SKIES } from '../appearance'

// Advanced mode: how this palace looks. Changes apply right away and are saved with the palace.
export default function AppearancePanel({ look, onChange, onPickSkyPhoto, onClose }) {
  const toggle = key => (
    <label className="check">
      <input type="checkbox" checked={look[key]} onChange={e => onChange({ [key]: e.target.checked })} />
      {key[0].toUpperCase() + key.slice(1)}
    </label>
  )
  const choice = (key, options) => (
    <div className="seg" role="radiogroup">
      {options.map(([value, label]) => (
        <button key={value} type="button" role="radio" aria-checked={look[key] === value} className={`chip${look[key] === value ? ' is-on' : ''}`} onClick={() => onChange({ [key]: value })}>
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <aside className="drawer appearance" aria-label="Appearance">
      <header className="drawer-head">
        <p className="eyebrow">Advanced · appearance</p>
        <button className="icon-btn" onClick={onClose} aria-label="Close appearance">×</button>
      </header>

      <h3>Background</h3>
      <div className="seg" role="radiogroup" aria-label="Sky">
        {SKIES.map(s => (
          <button key={s.id} type="button" role="radio" aria-checked={look.sky === s.id} className={`sky-swatch sky-${s.id}${look.sky === s.id ? ' is-on' : ''}`}
            onClick={() => (s.id === 'image' && !look.skyImageId ? document.getElementById('sky-photo').click() : onChange({ sky: s.id }))}>
            <span>{s.label}</span>
          </button>
        ))}
      </div>
      <label className="btn btn-small btn-ghost photo-btn">
        {look.skyImageId ? 'Change background photo' : 'Upload a background photo'}
        <input id="sky-photo" type="file" accept="image/*" hidden onChange={e => { if (e.target.files[0]) onPickSkyPhoto(e.target.files[0]); e.target.value = '' }} />
      </label>
      <div className="checks">
        {toggle('clouds')}
        {toggle('birds')}
        {toggle('sun')}
        {toggle('hills')}
        {toggle('castle')}
      </div>

      <h3>Signs</h3>
      <label className="check"><input type="checkbox" checked={look.showSigns} onChange={e => onChange({ showSigns: e.target.checked })} /> Show the stop signs</label>
      <p className="field-label">Color</p>
      <div className="seg" role="radiogroup" aria-label="Sign color">
        {SIGN_COLORS.map(c => (
          <button key={c.id} type="button" role="radio" aria-checked={look.signColor === c.id} title={c.label}
            className={`swatch${look.signColor === c.id ? ' is-on' : ''}`} style={{ background: c.swatch }} onClick={() => onChange({ signColor: c.id })}>
            <span className="sr-only">{c.label}</span>
          </button>
        ))}
      </div>
      <p className="field-label">Side</p>
      {choice('signSide', [['left', 'Left'], ['right', 'Right']])}
      <p className="field-label">Size</p>
      {choice('signSize', [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']])}

      <footer className="drawer-save">
        <span className="muted">Changes save automatically</span>
        <button className="btn btn-small btn-ghost" onClick={() => onChange({ ...DEFAULT_LOOK, skyImageId: look.skyImageId })}>Back to default</button>
      </footer>
    </aside>
  )
}
