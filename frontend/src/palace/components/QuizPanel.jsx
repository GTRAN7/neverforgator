import { useState } from 'react'
import StarButton from './StarButton'

export function QuizStart({ here, current, stops, onStart, onClose }) {
  const [opts, setOpts] = useState({ concepts: false, cards: true, shuffle: false, stops: false, chosen: [] }) //stops added to choose stops included in card set; modify to true when running; chosen[] added to check marked list when selected from a list of locations of the user :/
  const toggle = k => e => setOpts(o => ({ ...o, [k]: e.target.checked }))
  const count = c => (opts.concepts ? c.concepts * 2 : 0) + (opts.cards ? c.cards : 0)
  // With "Choose from multiple stops" on, only the ticked stops count toward "Whole route";
  // with "Only starred cards" on, only ★ cards count.
  const picked = stops.filter(l => !opts.stops || opts.chosen.includes(l.id))
  const cardsIn = list => list.reduce((n, l) => n + l.pins.filter(p => !opts.starredOnly || p.starred).length, 0)
  const routeCounts = { concepts: picked.filter(l => l.concept).length, cards: cardsIn(picked) }
  const hereCounts = { concepts: current.concept ? 1 : 0, cards: cardsIn([current]) }
  const starredTotal = stops.reduce((n, l) => n + l.pins.filter(p => p.starred).length, 0)
  return (
    <section className="plaque quiz" aria-label="Start a quiz">
      <button className="icon-btn plaque-close" onClick={onClose} aria-label="Close">×</button>
      <p className="eyebrow">Quiz</p>
      <h2 className="plaque-q">Walk the route and recall what lives at each stop.</h2>
      <div className="checks">
        {/* <label className="check"><input type="checkbox" checked={opts.concepts} onChange={toggle('concepts')} /> <span>Concepts, both ways: <i>“What's at this stop?”</i> and <i>“Where did you put it?”</i></span></label> */}
        <label className="check"><input type="checkbox" checked={opts.cards} onChange={toggle('cards')} /> Your pinned cards</label>
        <label className="check"><input type="checkbox" checked={opts.stops} onChange={toggle('stops')}/> Choose from multiple stops</label>
        {opts.stops && stops.map(l => (
          <label key={l.id} className="check stop-pick">
            <input
              type="checkbox"
              checked={opts.chosen.includes(l.id)}
              onChange={() => setOpts(o => ({
                ...o,
                chosen: o.chosen.includes(l.id)
                  ? o.chosen.filter(id => id !== l.id)
                  : [...o.chosen, l.id],
              }))}
            />
            {l.name}
          </label>
        ))}
        <label className="check"><input type="checkbox" checked={!!opts.starredOnly} onChange={toggle('starredOnly')} disabled={!starredTotal} /> Only starred cards (★ {starredTotal})</label>
        <label className="check"><input type="checkbox" checked={opts.shuffle} onChange={toggle('shuffle')} /> Shuffle cards within each stop</label>
      </div>
      <div className="row">
        <button className="btn" disabled={!count(routeCounts)} onClick={() => onStart('all', opts)}>Whole route · {count(routeCounts)}</button>
        <button className="btn btn-ghost" disabled={!count(hereCounts)} onClick={() => onStart('here', opts)}>Just {here} · {count(hereCounts)}</button>
      </div>
    </section>
  )
}

// One question. `onReveal` lets the app react (e.g. fly to the answer's location).
export function QuizStep({ step, total, eyebrow, question, image, imageWithAnswer = false, answer, starred, onStar, onReveal, onGrade, onStop }) {
  const [typed, setTyped] = useState('')
  const [revealed, setRevealed] = useState(false)
  const reveal = () => {
    setRevealed(true)
    onReveal?.()
  }
  return (
    <section className="plaque quiz" aria-label="Quiz">
      <div className="quiz-progress"><span style={{ width: `${(step / total) * 100}%` }} /></div>
      <p className="eyebrow">Question {step + 1} of {total} · {eyebrow}</p>
      <h2 className="plaque-q">{question}</h2>
      {image && !imageWithAnswer && <img className="card-img" src={image} alt="" />}
      {!revealed ? (
        <form onSubmit={e => { e.preventDefault(); reveal() }}>
          <textarea autoFocus rows={2} value={typed} onChange={e => setTyped(e.target.value)} placeholder="Type what you remember (optional)…"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); reveal() } }} />
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={onStop}>End quiz</button>
            <button className="btn">Reveal</button>
          </div>
        </form>
      ) : (
        <>
          <div className="compare">
            {typed && <div><p className="eyebrow">You said</p><p>{typed}</p></div>}
            <div>
              <p className="eyebrow">Answer</p>
              {image && imageWithAnswer && <img className="card-img" src={image} alt="" />}
              <div className="plaque-a">{answer}</div>
            </div>
          </div>
          <div className="row">
            {onStar && <StarButton starred={starred} onToggle={onStar} />}
            <button className="btn btn-miss" onClick={() => onGrade(false)}>✗ Missed it</button>
            <button className="btn btn-hit" autoFocus onClick={() => onGrade(true)}>✓ Got it</button>
          </div>
        </>
      )}
    </section>
  )
}

export function QuizSummary({ results, locations, onRetryMissed, onClose }) {
  const right = results.filter(r => r.ok).length
  const byLoc = locations
    .map(l => ({ name: l.name, rs: results.filter(r => r.locId === l.id) }))
    .filter(x => x.rs.length)
  const missed = results.length - right
  return (
    <section className="plaque quiz" aria-label="Quiz complete">
      <button className="icon-btn plaque-close" onClick={onClose} aria-label="Close">×</button>
      <p className="eyebrow">Quiz complete</p>
      <h2 className="plaque-q">{right} / {results.length} recalled</h2>
      <ul className="summary">
        {byLoc.map(x => (
          <li key={x.name}><span>{x.name}</span><b>{x.rs.filter(r => r.ok).length}/{x.rs.length}</b></li>
        ))}
      </ul>
      <div className="row">
        {missed > 0 && <button className="btn" onClick={onRetryMissed}>Retry {missed} missed</button>}
        <button className="btn btn-ghost" onClick={onClose}>Done</button>
      </div>
    </section>
  )
}

// Guided walkthrough: one stop at a time, showing its concept and memory image.
export function WalkPanel({ loc, stop, total, onPrev, onNext, onQuiz, onStop }) {
  const last = stop === total - 1
  return (
    <section className="plaque walk" aria-label="Walkthrough">
      <button className="icon-btn plaque-close" onClick={onStop} aria-label="End walkthrough">×</button>
      <div className="quiz-progress"><span style={{ width: `${((stop + 1) / total) * 100}%` }} /></div>
      <p className="eyebrow">Stop {stop + 1} of {total} · {loc.name}</p>
      <h2 className="plaque-q">{loc.concept || <em>No concept at this stop yet</em>}</h2>
      {loc.definition && <p className="definition">{loc.definition}</p>}
      {loc.association && <p className="plaque-a">{loc.association}</p>}
      <div className="row">
        <button className="btn btn-ghost" onClick={onPrev} disabled={stop === 0}>Back</button>
        {last
          ? <button className="btn" onClick={onQuiz}>Quiz me</button>
          : <button className="btn" autoFocus onClick={onNext}>Next stop</button>}
      </div>
    </section>
  )
}

// Shown when you press → on the last stop.
export function EndOfRoute({ stops, onAddStop, onQuiz, onContinue, onClose }) {
  return (
    <section className="plaque" aria-label="End of the route">
      <button className="icon-btn plaque-close" onClick={onClose} aria-label="Close">×</button>
      <p className="eyebrow">End of the route</p>
      <h2 className="plaque-q">You've walked past all {stops} stops. Ready to test yourself?</h2>
      <div className="row">
        <button className="btn btn-ghost" onClick={onAddStop}>+ Add the next stop</button>
        <button className="btn btn-ghost" onClick={onContinue}>Continue from the start</button>
        <button className="btn" autoFocus onClick={onQuiz}>Quiz me!</button>
      </div>
    </section>
  )
}
