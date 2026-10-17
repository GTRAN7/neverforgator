import { useState } from 'react'
import AIButton from './AIButton'

// "New location" form: name, description, optional subject, and an optional
// photo picked right away (transparent cutouts stand on the sky like the UF ones).
export default function AddLocationDialog({ onCreate, onClose }) {
  const [form, setForm] = useState({ name: '', description: '', subject: '' })
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  const pick = next => {
    if (preview) URL.revokeObjectURL(preview)
    setFile(next)
    setPreview(next ? URL.createObjectURL(next) : null)
  }

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
        <div className="plaque-form">
          <label>Name<input autoFocus required value={form.name} onChange={set('name')} placeholder="e.g. My dorm room" /></label>
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
            <span className="photo-drop">
              {preview
                ? <img src={preview} alt="" />
                : <span>Choose a photo<br /><small>PNGs with a transparent background stand on the sky</small></span>}
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
