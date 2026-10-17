import signUrl from '../assets/sign.webp'

// Campus wayfinding sign: place name on the top panel, subject on the bottom.
// Text boxes are positioned in % of the sign art so they track its panels.
// With `onEdit`, clicking the sign (or Enter/Space on it) opens the stop's notes.
export default function Sign({ loc, onEdit }) {
  const long = loc.name.length > 16
  const cards = loc.pins.length
  // Your own locations may have no subject yet; fall back to their description.
  const topic = loc.subject || loc.description || ''
  return (
    <div
      className={`sign${onEdit ? ' is-editable' : ''}`}
      tabIndex={0}
      role={onEdit ? 'button' : undefined}
      aria-label={onEdit ? `Edit ${loc.name}` : `${loc.name}: ${topic}`}
      title={onEdit ? 'Edit this stop' : undefined}
      onClick={onEdit}
      onKeyDown={e => {
        if (onEdit && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onEdit()
        }
      }}
    >
      <img src={signUrl} alt="" draggable={false} />
      <h1 className={`sign-name${long ? ' is-long' : ''}`}>{loc.name}</h1>
      <div className="sign-topic">
        <p className={`sign-subject${topic.length > 18 ? ' is-long' : ''}`}>{topic}</p>
        <p className="sign-count">{cards} {cards === 1 ? 'card' : 'cards'}</p>
      </div>
      {onEdit && <span className="sign-edit" aria-hidden="true">✎ Edit</span>}
    </div>
  )
}
