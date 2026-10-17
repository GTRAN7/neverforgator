import { useState } from 'react'

export function QuizStart({ here, total, hereCount, onStart, onClose }) {
  const [shuffle, setShuffle] = useState(false)
  return (
    <section className="plaque quiz" aria-label="Start a walk">
      <button className="icon-btn plaque-close" onClick={onClose} aria-label="Close">×</button>
      <p className="eyebrow">Walk the palace</p>
      <h2 className="plaque-q">Retrace your route and recall what lives at each spot.</h2>
      <label className="check"><input type="checkbox" checked={shuffle} onChange={e => setShuffle(e.target.checked)} /> Shuffle cards within each location</label>
      <div className="row">
        <button className="btn" disabled={!total} onClick={() => onStart('all', shuffle)}>Whole campus · {total}</button>
        <button className="btn btn-ghost" disabled={!hereCount} onClick={() => onStart('here', shuffle)}>Just {here} · {hereCount}</button>
      </div>
    </section>
  )
}

export function QuizStep({ step, total, locName, pin, onGrade, onStop }) {
  const [typed, setTyped] = useState('')
  const [revealed, setRevealed] = useState(false)
  return (
    <section className="plaque quiz" aria-label="Quiz">
      <div className="quiz-progress"><span style={{ width: `${(step / total) * 100}%` }} /></div>
      <p className="eyebrow">Stop {step + 1} of {total} · {locName}{pin.topic && ` · ${pin.topic}`}</p>
      <h2 className="plaque-q">{pin.question || 'What lives at this spot?'}</h2>
      {!revealed ? (
        <form onSubmit={e => { e.preventDefault(); setRevealed(true) }}>
          <textarea autoFocus rows={2} value={typed} onChange={e => setTyped(e.target.value)} placeholder="Type what you remember (optional)…"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setRevealed(true) } }} />
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={onStop}>End walk</button>
            <button className="btn">Reveal</button>
          </div>
        </form>
      ) : (
        <>
          <div className="compare">
            {typed && <div><p className="eyebrow">You said</p><p>{typed}</p></div>}
            <div><p className="eyebrow">Answer</p><p className="plaque-a">{pin.answer || <em>No answer saved.</em>}</p></div>
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
    <section className="plaque quiz" aria-label="Walk complete">
      <button className="icon-btn plaque-close" onClick={onClose} aria-label="Close">×</button>
      <p className="eyebrow">Walk complete</p>
      <h2 className="plaque-q">{right} / {results.length} recalled</h2>
      <ul className="summary">
        {byLoc.map(x => (
          <li key={x.name}><span>{x.name}</span><b>{x.rs.filter(r => r.ok).length}/{x.rs.length}</b></li>
        ))}
      </ul>
      <div className="row">
        {missed > 0 && <button className="btn" onClick={onRetryMissed}>Re-walk {missed} missed</button>}
        <button className="btn btn-ghost" onClick={onClose}>Done</button>
      </div>
    </section>
  )
}
