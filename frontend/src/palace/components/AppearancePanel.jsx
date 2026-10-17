import { useState } from 'react'
import { CURSORS, DEFAULT_LOOK, PRESET_COLORS, SIGN_COLORS, SKIES, normalizeHex, signLayoutOf } from '../appearance'
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

// A row of ready-made colors. `extra` adds swatches before them (e.g. the original UF blue sign).
function Presets({ value, onSet, label, extra = [] }) {
  return (
    <div className="presets" role="radiogroup" aria-label={`${label} presets`}>
      {[...extra, ...PRESET_COLORS.map(c => ({ ...c, id: c.hex }))].map(c => (
        <button key={c.id} type="button" role="radio" aria-checked={value === c.id} title={c.label}
          className={`swatch${value === c.id ? ' is-on' : ''}`} style={{ background: c.hex }} onClick={() => onSet(c.id)}>
          <span className="sr-only">{c.label}</span>
        </button>
      ))}
    </div>
  )
}

// One pin color: presets, the hex box, and a reset back to the built-in color.
const PIN_COLORS = [
  { key: 'pinColor', label: 'Not quizzed yet', fallback: '#f4a43c' },
  { key: 'pinGoodColor', label: 'Remembered', fallback: '#6fae5a' },
  { key: 'pinShakyColor', label: 'Missed', fallback: '#e0664a' },
]
function PinColor({ look, field, onChange, disabled }) {
  const { key, label, fallback } = field
  return (
    <div className={`pin-color${disabled ? ' is-off' : ''}`}>
      <p className="field-label">{label}</p>
      <Presets label={label} value={look[key]} onSet={hex => onChange({ [key]: hex })} />
      <div className="pin-color-row">
        <ColorField label={`${label} pin color`} value={look[key] ?? fallback} onSet={hex => onChange({ [key]: hex })} />
        {look[key] && (
          <button type="button" className="link" onClick={() => onChange({ [key]: null, ...(key === 'pinColor' && { pinColorAll: false }) })}>Reset</button>
        )}
      </div>
    </div>
  )
}

// Advanced mode: how this palace looks. Changes apply right away and are saved with the palace.
export default function AppearancePanel({ look, night, onChange, onPickSkyPhoto, signArt, onPickSignArt, onResetSignArt, onPickCursor, onClose, side = 'right', onFlipSide }) {
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
    <aside className={`drawer drawer-${side} appearance`} aria-label="Appearance">
      <header className="drawer-head">
        <p className="eyebrow">Advanced · appearance</p>
        <button className="icon-btn drawer-flip" onClick={onFlipSide} aria-label="Move this panel to the other side" title="Move this panel to the other side">⇄</button>
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

      <h3>Quiz</h3>
      <label className="check">
        <input type="checkbox" checked={look.quizZoom} onChange={e => onChange({ quizZoom: e.target.checked })} />
        Zoom in on each card's spot during quizzes
      </label>

      <details className="adv-section">
        <summary>Card pins</summary>
        <div className="pin-colors">
          <PinColor look={look} field={PIN_COLORS[0]} onChange={onChange} />
          <label className="check">
            <input type="checkbox" checked={look.pinColorAll} disabled={!look.pinColor} onChange={e => onChange({ pinColorAll: e.target.checked })} />
            Use this color for every pin (hides the remembered / missed colors)
          </label>
          {!(look.pinColor && look.pinColorAll) && PIN_COLORS.slice(1).map(f => <PinColor key={f.key} look={look} field={f} onChange={onChange} />)}
        </div>
      </details>

      <details className="adv-section">
        <summary>Signs</summary>
        <label className="check"><input type="checkbox" checked={look.showSigns} onChange={e => onChange({ showSigns: e.target.checked })} /> Show the stop signs</label>
        <p className="field-label">Color</p>
        <Presets
          label="Sign color"
          extra={[{ id: 'blue', hex: SIGN_COLORS[0].swatch, label: 'UF blue (original)' }]}
          value={look.signColor === 'custom' ? look.signTint : look.signColor}
          onSet={id => onChange(id === 'blue' ? { signColor: 'blue' } : { signColor: 'custom', signTint: id })}
        />
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
      </details>

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
