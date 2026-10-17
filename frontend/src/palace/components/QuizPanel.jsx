import { useState } from 'react'

export function QuizStart({ here, counts, onStart, onClose }) {
  const [opts, setOpts] = useState({ concepts: true, cards: true, shuffle: false })
  const toggle = k => e => setOpts(o => ({ ...o, [k]: e.target.checked }))
  const count = c => (opts.concepts ? c.concepts * 2 : 0) + (opts.cards ? c.cards : 0)
  return (
    <section className="plaque quiz" aria-label="Start a quiz">
      <button className="icon-btn plaque-close" onClick={onClose} aria-label="Close">×</button>
      <p className="eyebrow">Quiz</p>
      <h2 className="plaque-q">Walk the route and recall what lives at each stop.</h2>
      <div className="checks">
        <label className="check"><input type="checkbox" checked={opts.concepts} onChange={toggle('concepts')} /> Concepts, both ways: <i>“What's at this stop?”</i> and <i>“Where did you put it?”</i></label>
        <label className="check"><input type="checkbox" checked={opts.cards} onChange={toggle('cards')} /> Your pinned cards</label>
        <label className="check"><input type="checkbox" checked={opts.shuffle} onChange={toggle('shuffle')} /> Shuffle cards within each stop</label>
      </div>
      <div className="row">
        <button className="btn" disabled={!count(counts.all)} onClick={() => onStart('all', opts)}>Whole route · {count(counts.all)}</button>
        <button className="btn btn-ghost" disabled={!count(counts.here)} onClick={() => onStart('here', opts)}>Just {here} · {count(counts.here)}</button>
      </div>
    </section>
  )
}

// One question. `onReveal` lets the app react (e.g. fly to the answer's location).
export function QuizStep({ step, total, eyebrow, question, image, answer, onReveal, onGrade, onStop }) {
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
      {image && <img className="card-img" src={image} alt="" />}
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
            <div><p className="eyebrow">Answer</p><div className="plaque-a">{answer}</div></div>
          </div>
          <div className="row">
            <button className="btn btn-miss" onClick={() => onGrade(false)}>Missed it</button>
            <button className="btn btn-hit" autoFocus onClick={() => onGrade(true)}>Got it</button>
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
