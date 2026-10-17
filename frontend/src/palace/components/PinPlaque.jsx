import { useState } from 'react'
import CardPhoto from './CardPhoto'
import StarButton from './StarButton'

// The wooden "sign" that appears when you click a pin in the scene.
export default function PinPlaque({ pin, n, photoUrl, editing, onChange, onPhoto, onDelete, onClose }) {
  const [revealed, setRevealed] = useState(false)
  const set = field => e => onChange({ [field]: e.target.value })

  return (
    <section className="plaque" aria-label={`Card ${n}`}>
      <button className="icon-btn plaque-close" onClick={onClose} aria-label="Close">×</button>
      {editing ? (
        <div className="plaque-form">
          <label>Topic<input value={pin.topic} onChange={set('topic')} placeholder="e.g. Glycolysis" /></label>
          <label>Question<textarea autoFocus={!pin.question} value={pin.question} onChange={set('question')} rows={2} placeholder="What should this spot remind you of?" /></label>
          <label>Answer<textarea value={pin.answer} onChange={set('answer')} rows={3} placeholder="The thing to recall" /></label>
          <CardPhoto url={photoUrl} onPick={onPhoto} onRemove={() => onChange({ imageId: null })} />
          <div className="row">
            <StarButton starred={pin.starred} onToggle={() => onChange({ starred: !pin.starred })} />
            <button className="btn btn-danger" onClick={onDelete}>Delete card</button>
            <button className="btn" onClick={onClose}>Done</button>
          </div>
        </div>
      ) : (
        <>
          <div className="plaque-top">
            <p className="eyebrow">#{n}{pin.topic && ` · ${pin.topic}`}</p>
            <StarButton starred={pin.starred} onToggle={() => onChange({ starred: !pin.starred })} />
          </div>
          {photoUrl && <img className="card-img" src={photoUrl} alt="" />}
          <h2 className="plaque-q">{pin.question || <em>No question yet — switch to Edit to write one.</em>}</h2>
          {revealed
            ? <p className="plaque-a">{pin.answer || <em>No answer saved.</em>}</p>
            : <button className="btn" onClick={() => setRevealed(true)}>Reveal answer</button>}
        </>
      )}
    </section>
  )
}
