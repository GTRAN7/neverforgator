import { useState } from 'react'
import AIButton from './AIButton'
import Placeholder from './Placeholder'
import { useFileDrop } from '../useFileDrop'

// "New location": pick one of the UF campus places not on your route yet, or
// make your own (name, description, optional subject and photo; transparent
// cutouts stand on the sky like the UF ones).
export default function AddLocationDialog({ campus = [], imageFor, onPickCampus, onCreate, onClose }) {
  const [form, setForm] = useState({ name: '', description: '', subject: '' })
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  const pick = next => {
    if (preview) URL.revokeObjectURL(preview)
    setFile(next)
    setPreview(next ? URL.createObjectURL(next) : null)
  }
  const drop = useFileDrop(files => pick(files[0]))

  const pickButton = c => (
    <li key={c.name}>
      <button type="button" className="campus-pick" onClick={() => onPickCampus(c)}>
        <span className="campus-thumb">
          {imageFor(c) ? <img src={imageFor(c)} alt="" /> : <Placeholder variant={c.variant} palette={c.palette} />}
        </span>
        <span>{c.name}</span>
      </button>
    </li>
  )

  const submit = e => {
    e.preventDefault()
    if (!form.name.trim()) return
    onCreate({ ...form, name: form.name.trim() }, file)
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <form className="plaque dialog" onSubmit={submit} onClick={e => e.stopPropagation()} aria-label="New location">
        <button type="button" className="icon-btn plaque-close" onClick={onClose} aria-label="Close">×</button>
        <p className="eyebrow">New location</p>
        <h2 className="plaque-q">Add a stop to your route</h2>
        {campus.length > 0 && (
          <>
            <p className="field-label">Pick a UF place</p>
            <ul className="campus-picks">{campus.slice(0, 3).map(pickButton)}</ul>
            {campus.length > 3 && (
              <details className="more-places">
                <summary>More UF places ({campus.length - 3})</summary>
                <ul className="campus-picks">{campus.slice(3).map(pickButton)}</ul>
              </details>
            )}
            <p className="field-label">Or make your own</p>
          </>
        )}
        <div className="plaque-form">
          <label>Name<input autoFocus={!campus.length} required value={form.name} onChange={set('name')} placeholder="e.g. My dorm room" /></label>
          <label>Subject <span className="optional">(optional)</span><input value={form.subject} onChange={set('subject')} placeholder="e.g. Chemistry" /></label>
          <div className="field-ai">
            <label>Description<textarea rows={3} value={form.description} onChange={set('description')} placeholder="What's here, or how to picture it" /></label>
            <AIButton
              label="Describe the subject"
              request={() => ({ kind: 'subject', text: form.subject, place: form.name })}
              onResult={description => setForm(f => ({ ...f, description }))}
            />
          </div>
          <label className="photo-pick">
            Photo <span className="optional">(optional)</span>
            <span className={`photo-drop${drop.over ? ' is-over' : ''}`} {...drop.props}>
              {preview
                ? <img src={preview} alt="" />
                : <span>Choose or drop a photo<br /><small>PNGs with a transparent background stand on the sky</small></span>}
            </span>
            <input type="file" accept="image/*" hidden onChange={e => pick(e.target.files[0] ?? null)} />
          </label>
        </div>
        <div className="row">
          {file && <button type="button" className="btn btn-ghost" onClick={() => pick(null)}>Remove photo</button>}
          <button className="btn" disabled={!form.name.trim()}>Add location</button>
        </div>
      </form>
    </div>
  )
}
