// Side panel: everything you've attached to the current location.
export default function NotesDrawer({ loc, editing, activePinId, onChange, onPinChange, onSelectPin, onAddCard, onDeletePin, onUpload, onRemovePhoto, onDeleteLocation, onClose }) {
  const set = field => e => onChange({ [field]: e.target.value })
  return (
    <aside className="drawer" aria-label={`Notes for ${loc.name}`}>
      <header className="drawer-head">
        <p className="eyebrow">Stop notes</p>
        <button className="icon-btn" onClick={onClose} aria-label="Close notes">×</button>
      </header>

      <label className="field">Place
        <input value={loc.name} onChange={set('name')} />
      </label>
      <label className="field">Subject / theme
        <input value={loc.subject} onChange={set('subject')} placeholder="e.g. Organic Chemistry" />
      </label>
      <label className="field">Concept at this stop
        <input value={loc.concept ?? ''} onChange={set('concept')} placeholder="e.g. Photosynthesis" />
      </label>
      <label className="field">Memory image
        <textarea rows={4} value={loc.association ?? ''} onChange={set('association')} placeholder="A vivid scene that ties the concept to this place…" />
      </label>

      <div className="row">
        <button className="btn btn-small" onClick={onUpload}>{(loc.imageId || loc.builtin) ? 'Change photo' : 'Upload photo'}</button>
        {(loc.imageId || loc.builtin) && <button className="btn btn-small btn-ghost" onClick={onRemovePhoto}>Remove photo</button>}
      </div>

      <div className="drawer-section">
        <h3>Cards <span className="count">{loc.pins.length}</span></h3>
        <button className="btn btn-small" onClick={onAddCard}>+ Add card</button>
      </div>

      <ol className="card-list">
        {loc.pins.map((pin, i) => (
          <li key={pin.id} className={pin.id === activePinId ? 'is-active' : ''} onClick={() => onSelectPin(pin.id)}>
            <span className="card-num">{i + 1}</span>
            {editing ? (
              <div className="card-edit" onClick={e => e.stopPropagation()}>
                <input value={pin.topic} placeholder="Topic" onChange={e => onPinChange(pin.id, { topic: e.target.value })} />
                <textarea rows={2} value={pin.question} placeholder="Question" onChange={e => onPinChange(pin.id, { question: e.target.value })} />
                <textarea rows={2} value={pin.answer} placeholder="Answer" onChange={e => onPinChange(pin.id, { answer: e.target.value })} />
                <button className="link" onClick={() => onDeletePin(pin.id)}>Delete</button>
              </div>
            ) : (
              <div>
                {pin.topic && <p className="eyebrow">{pin.topic}</p>}
                <p className="card-q">{pin.question || 'Untitled card'}</p>
                <p className="card-stats">✓ {pin.stats.right} · ✗ {pin.stats.wrong}</p>
              </div>
            )}
          </li>
        ))}
      </ol>
      {!loc.pins.length && <p className="muted">No cards yet. Turn on <b>Edit</b> and click anywhere in the scene to pin a question to that spot.</p>}

      {editing && <button className="link danger" onClick={onDeleteLocation}>Delete this location</button>}
    </aside>
  )
}
