import { useEffect, useState } from 'react'
import { uid } from '../seed'

const FIELDS = ['name', 'subject', 'concept', 'association']
const draftOf = loc => ({
  ...Object.fromEntries(FIELDS.map(f => [f, loc[f] ?? ''])),
  pins: loc.pins,
})

// Side panel for the current stop. Edits are kept as a draft and only applied
// (and shown on the stop's sign) when you press Save.
export default function NotesDrawer({ loc, activePinId, onSave, onDirty, onSelectPin, onUpload, onRemovePhoto, onDeleteLocation, onClose }) {
  const [draft, setDraft] = useState(() => draftOf(loc))
  const [openCard, setOpenCard] = useState(null)
  const [saved, setSaved] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(loc))
  // Let the app know, so moving to another stop can warn before losing the draft.
  useEffect(() => {
    onDirty(dirty)
    return () => onDirty(false)
  }, [dirty, onDirty])

  const edit = patch => {
    setDraft(d => ({ ...d, ...patch }))
    setSaved(false)
  }
  const set = field => e => edit({ [field]: e.target.value })
  const setPin = (id, patch) => edit({ pins: draft.pins.map(p => (p.id === id ? { ...p, ...patch } : p)) })
  const addCard = () => {
    const pin = { id: uid(), x: 40 + Math.random() * 20, y: 40 + Math.random() * 20, topic: '', question: '', answer: '', stats: { right: 0, wrong: 0 } }
    edit({ pins: [...draft.pins, pin] })
    setOpenCard(pin.id)
  }
  const save = () => {
    onSave(draft)
    setSaved(true)
  }
  const close = () => onClose()

  return (
    <aside className="drawer" aria-label={`Notes for ${loc.name}`}>
      <header className="drawer-head">
        <p className="eyebrow">Stop notes</p>
        <button className="icon-btn" onClick={close} aria-label="Close notes">×</button>
      </header>

      <label className="field">Place
        <input value={draft.name} onChange={set('name')} />
      </label>
      <label className="field">Subject / theme
        <input value={draft.subject} onChange={set('subject')} placeholder="e.g. Organic Chemistry" />
      </label>
      <label className="field">Concept at this stop
        <input value={draft.concept} onChange={set('concept')} placeholder="e.g. Photosynthesis" />
      </label>
      <label className="field">Memory image
        <textarea rows={4} value={draft.association} onChange={set('association')} placeholder="A vivid scene that ties the concept to this place…" />
      </label>

      <div className="row">
        <button className="btn btn-small" onClick={onUpload}>{(loc.imageId || loc.builtin) ? 'Change photo' : 'Upload photo'}</button>
        {(loc.imageId || loc.builtin) && <button className="btn btn-small btn-ghost" onClick={onRemovePhoto}>Remove photo</button>}
      </div>

      <div className="drawer-section">
        <h3>Cards <span className="count">{draft.pins.length}</span></h3>
        <button className="btn btn-small" onClick={addCard}>+ Add card</button>
      </div>

      <ol className="card-list">
        {draft.pins.map((pin, i) => (
          <li key={pin.id} className={pin.id === activePinId || pin.id === openCard ? 'is-active' : ''}>
            <span className="card-num">{i + 1}</span>
            {openCard === pin.id ? (
              <div className="card-edit">
                <input value={pin.topic} placeholder="Topic" onChange={e => setPin(pin.id, { topic: e.target.value })} />
                <textarea autoFocus={!pin.question} rows={2} value={pin.question} placeholder="Question" onChange={e => setPin(pin.id, { question: e.target.value })} />
                <textarea rows={2} value={pin.answer} placeholder="Answer" onChange={e => setPin(pin.id, { answer: e.target.value })} />
                <div className="row">
                  <button className="btn btn-small btn-danger" onClick={() => edit({ pins: draft.pins.filter(p => p.id !== pin.id) })}>Delete card</button>
                  <button className="btn btn-small btn-ghost" onClick={() => setOpenCard(null)}>Done</button>
                </div>
              </div>
            ) : (
              <button className="card-view" onClick={() => { setOpenCard(pin.id); onSelectPin(pin.id) }}>
                {pin.topic && <span className="eyebrow">{pin.topic}</span>}
                <span className="card-q">{pin.question || 'Untitled card'}</span>
                <span className="card-stats">✓ {pin.stats.right} · ✗ {pin.stats.wrong} · tap to edit</span>
              </button>
            )}
          </li>
        ))}
      </ol>
      {!draft.pins.length && <p className="muted">No cards yet. Add one here, or turn on <b>Edit</b> and click a spot in the scene.</p>}

      <button className="btn btn-small btn-danger drawer-delete" onClick={onDeleteLocation}>Delete this location</button>

      <footer className="drawer-save">
        <span className="muted">{dirty ? 'Unsaved changes' : saved ? 'Saved ✓' : 'No changes'}</span>
        <button className="btn btn-small btn-ghost" disabled={!dirty} onClick={() => { setDraft(draftOf(loc)); setOpenCard(null) }}>Revert</button>
        <button className="btn btn-small" disabled={!dirty} onClick={save}>Save</button>
      </footer>
    </aside>
  )
}
