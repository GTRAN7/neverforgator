import signUrl from '../assets/sign.webp'

// Campus wayfinding sign: place name on the top panel, subject on the bottom.
// Text boxes are positioned in % of the sign art so they track its panels.
export default function Sign({ loc }) {
  const long = loc.name.length > 16
  const cards = loc.pins.length
  // Your own locations may have no subject yet; fall back to their description.
  const topic = loc.subject || loc.description || ''
  return (
    <div className="sign" tabIndex={0} aria-label={`${loc.name}: ${loc.subject}`}>
      <img src={signUrl} alt="" draggable={false} />
      <h1 className={`sign-name${long ? ' is-long' : ''}`}>{loc.name}</h1>
      <div className="sign-topic">
        <p className={`sign-subject${topic.length > 18 ? ' is-long' : ''}`}>{topic}</p>
        <p className="sign-count">{cards} {cards === 1 ? 'card' : 'cards'}</p>
      </div>
    </div>
  )
}
