import { useState } from 'react'
import { CURSORS, DEFAULT_LOOK, SIGN_COLORS, SKIES, normalizeHex, signLayoutOf } from '../appearance'
import { useFileDrop } from '../useFileDrop'
import SignLayoutEditor from './SignLayoutEditor'

// Color control: a hex-code box with a small color square inside it. Typing a
// code ("#7b2cbf", "7b2cbf" or "#7bc") applies it once valid; clicking the
// square opens the color wheel.
function ColorField({ value, onSet, label }) {
  const [text, setText] = useState(value)
  const [last, setLast] = useState(value)
  if (value !== last) {
    // Changed elsewhere (wheel, preset): show the new code.
    setLast(value)
    setText(value)
  }
  const valid = normalizeHex(text)
  return (
    <span className={`color-field${valid || !text ? '' : ' is-bad'}`}>
      <label className="color-chip" style={{ background: valid ?? value }} title="Open the color wheel">
        <span className="sr-only">Open the color wheel for {label}</span>
        <input type="color" value={valid ?? value} onChange={e => onSet(e.target.value)} />
      </label>
      <input
        className="hex-field"
        aria-label={`${label} hex code`}
        placeholder="#hex"
        value={text}
        maxLength={7}
        spellCheck={false}
        onChange={e => {
          setText(e.target.value)
          const hex = normalizeHex(e.target.value)
          if (hex) onSet(hex)
        }}
      />
    </span>
  )
}

// Advanced mode: how this palace looks. Changes apply right away and are saved with the palace.
export default function AppearancePanel({ look, night, onChange, onPickSkyPhoto, signArt, onPickSignArt, onResetSignArt, onPickCursor, onClose }) {
  const drop = useFileDrop(files => onPickSkyPhoto(files[0]))
  const signDrop = useFileDrop(files => onPickSignArt(files[0]))
  const cursorDrop = useFileDrop(files => onPickCursor(files[0]))
  const layout = signLayoutOf(look)
  const setBox = (key, patch) => onChange({ signLayout: { ...layout, [key]: { ...layout[key], ...patch } } })
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
      <p className="hint">Auto shows day, or night when night mode is on{night ? ' (it is now)' : ''}. Any other sky stays as you pick it in both modes.</p>
      <div className="seg" role="radiogroup" aria-label="Sky">
        {SKIES.map(s => (
          <button key={s.id} type="button" role="radio" aria-checked={look.sky === s.id} className={`sky-swatch sky-${s.id}${look.sky === s.id ? ' is-on' : ''}`}
            onClick={() => (s.id === 'image' && !look.skyImageId ? document.getElementById('sky-photo').click() : onChange({ sky: s.id, skyPicked: true }))}>
            <span>{s.label}</span>
          </button>
        ))}
      </div>
      <label className={`btn btn-small btn-ghost photo-btn${drop.over ? ' is-over' : ''}`} {...drop.props}>
        {look.skyImageId ? 'Change (or drop) background photo' : 'Upload or drop a background photo'}
        <input id="sky-photo" type="file" accept="image/*" hidden onChange={e => { if (e.target.files[0]) onPickSkyPhoto(e.target.files[0]); e.target.value = '' }} />
      </label>
      <div className="checks">
        {toggle('clouds')}
        {toggle('birds')}
        {toggle('sun')}
        {toggle('hills')}
      </div>

      <h3>Card pins</h3>
      <div className="pin-color-row">
        <ColorField label="Pin color" value={look.pinColor ?? '#f4a43c'} onSet={pinColor => onChange({ pinColor })} />
        {look.pinColor && <button type="button" className="link" onClick={() => onChange({ pinColor: null, pinColorAll: false })}>Reset</button>}
      </div>
      <label className="check">
        <input type="checkbox" checked={look.pinColorAll} disabled={!look.pinColor} onChange={e => onChange({ pinColorAll: e.target.checked })} />
        Same color for every pin (hides the remembered / missed colors)
      </label>

      <h3>Quiz</h3>
      <label className="check">
        <input type="checkbox" checked={look.quizZoom} onChange={e => onChange({ quizZoom: e.target.checked })} />
        Zoom in on each card's spot during quizzes
      </label>

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
      <ColorField
        label="Sign color"
        value={look.signColor === 'custom' ? look.signTint : (SIGN_COLORS.find(c => c.id === look.signColor) ?? SIGN_COLORS[0]).swatch}
        onSet={signTint => onChange({ signColor: 'custom', signTint })}
      />
      <p className="field-label">Side</p>
      {choice('signSide', [['left', 'Left'], ['right', 'Right']])}
      <p className="field-label">Size</p>
      {choice('signSize', [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']])}

      <p className="field-label">Sign artwork</p>
      <div className="row art-row">
        <label className={`btn btn-small btn-ghost${signDrop.over ? ' is-over' : ''}`} {...signDrop.props}>
          {look.signImageId ? 'Change (or drop) sign image' : 'Upload or drop your own sign'}
          <input type="file" accept="image/*" hidden onChange={e => { if (e.target.files[0]) onPickSignArt(e.target.files[0]); e.target.value = '' }} />
        </label>
        {look.signImageId && <button type="button" className="btn btn-small btn-ghost" onClick={onResetSignArt}>Use the campus sign</button>}
      </div>

      <p className="field-label">Text on the sign</p>
      <p className="hint">Drag the boxes to where the words should go; drag a corner to resize.</p>
      <SignLayoutEditor
        url={signArt?.url}
        ar={look.signAr}
        layout={layout}
        lettering={look.signText === 'dark' ? '#1d140c' : '#faf3e8'}
        onChange={signLayout => onChange({ signLayout })}
      />
      <label className="check"><input type="checkbox" checked={layout.name.show} onChange={e => setBox('name', { show: e.target.checked })} /> Show the place name</label>
      <label className="check"><input type="checkbox" checked={layout.topic.show} onChange={e => setBox('topic', { show: e.target.checked })} /> Show the subject</label>
      <p className="field-label">Letters</p>
      <div className="seg">
        <ColorField
          label="Letter color"
          value={{ light: '#faf3e8', dark: '#1d140c' }[look.signText] ?? look.signTextColor}
          onSet={signTextColor => onChange({ signText: 'custom', signTextColor })}
        />
        {choice('signText', [['light', 'Light'], ['dark', 'Dark']])}
      </div>
      <label className="slider">
        <span>Place name size <b>{Math.round(look.signNameScale * 100)}%</b></span>
        <input type="range" min="0.6" max="1.6" step="0.05" value={look.signNameScale} onChange={e => onChange({ signNameScale: +e.target.value })} />
      </label>
      <label className="slider">
        <span>Subject size <b>{Math.round(look.signTopicScale * 100)}%</b></span>
        <input type="range" min="0.6" max="1.6" step="0.05" value={look.signTopicScale} onChange={e => onChange({ signTopicScale: +e.target.value })} />
      </label>
      <button type="button" className="link" onClick={() => onChange({ signLayout: null })}>Put the text back where it was</button>

      <details className="adv-section">
        <summary>Cursor</summary>
        <div className="seg" role="radiogroup" aria-label="Cursor">
          {CURSORS.map(c => (
            <button key={c.id} type="button" role="radio" aria-checked={look.cursor === c.id} title={c.label}
              className={`chip cursor-chip${look.cursor === c.id ? ' is-on' : ''}`}
              style={c.css ? { cursor: c.css } : undefined}
              onClick={() => onChange({ cursor: c.id })}>
              {c.label}
            </button>
          ))}
          {look.cursorUrl && (
            <button type="button" role="radio" aria-checked={look.cursor === 'custom'}
              className={`chip cursor-chip${look.cursor === 'custom' ? ' is-on' : ''}`} onClick={() => onChange({ cursor: 'custom' })}>
              <img src={look.cursorUrl} alt="" width="16" height="16" /> Mine
            </button>
          )}
        </div>
        <label className={`btn btn-small btn-ghost photo-btn${cursorDrop.over ? ' is-over' : ''}`} {...cursorDrop.props}>
          Upload or drop a cursor image
          <input type="file" accept="image/*" hidden onChange={e => { if (e.target.files[0]) onPickCursor(e.target.files[0]); e.target.value = '' }} />
        </label>
        <p className="hint">Hover the options to try them. Small PNGs with a transparent background work best.</p>
      </details>

      <footer className="drawer-save">
        <span className="muted">Changes save automatically</span>
        <button className="btn btn-small btn-ghost" onClick={() => onChange({ ...DEFAULT_LOOK, skyPicked: false, skyImageId: look.skyImageId, signImageId: look.signImageId, signAr: look.signAr, cursorUrl: look.cursorUrl })}>Back to default</button>
      </footer>
    </aside>
  )
}
