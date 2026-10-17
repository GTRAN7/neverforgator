import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Creature, { Sparkle } from './Creature.jsx';
import NotesImport from './NotesImport.jsx';
import { readPrefs } from '../lib/prefs.js';
import { placeName } from '../lib/path.js';

const NOTES_CAP = 20_000; // characters, ≈ 5,000 tokens (the server enforces the same cap)

const SAMPLE_NOTES = `Chapter 4: Cell organelles
The nucleus holds the cell's DNA and controls its activity.
The cell membrane controls what enters and leaves the cell.
Mitochondria produce ATP, the cell's main energy source.
Ribosomes build proteins from amino acids.
The Golgi apparatus packages and ships proteins.
Vacuoles store water and nutrients.
The endoplasmic reticulum is a network that transports materials.
Lysosomes break down waste with enzymes.`;

const STYLES = [
  { id: 'storybook', label: 'Storybook' },
  { id: 'claymation', label: 'Claymation' },
  { id: 'sticker', label: 'Sticker' },
  { id: 'pixel', label: 'Pixel art' },
];

const CONFETTI = [[6, 10], [18, 84], [30, 5], [52, 93], [70, 6], [88, 16], [94, 70], [80, 90], [4, 58], [44, 3], [96, 42], [12, 38], [62, 95], [26, 92]];
const CONFETTI_COLORS = ['#F08A6C', '#7FA98B', '#FFD86B', '#8CCBFF', '#FF9EC4'];

// "Feed your palace": paste notes → Gemini cuts them into ideas (one picture each), gives each
// idea its own stop and writes a scene for it. Pictures are drawn later, when you first wander
// past a friend, so you only pay for the ones you actually study.
// onDone: go wander. onQuiz: go to the quiz. onReady(palace): the fill finished (the editor tells
// you even if you closed this window while it was working).
export default function FeedModal({ palace, setPalace, onClose, onDone, onQuiz, onReady }) {
  const [notes, setNotes] = useState(palace.notes ?? '');
  const [style, setStyle] = useState(() => palace.style ?? readPrefs().style);
  const [writing, setWriting] = useState(false); // waiting for Gemini to write the scenes
  const [fed, setFed] = useState(false); // scenes written during this visit
  const [error, setError] = useState('');
  const [usage, setUsage] = useState(null); // today's fair-use quotas (see backend/limits.js)

  const { spots, fillReport: report } = palace;
  const refreshUsage = () => api.usage().then(setUsage).catch(() => {});
  const left = (action) => (usage ? Math.max(0, usage[action].limit - usage[action].used) : null);

  useEffect(() => { refreshUsage(); }, []);

  // Text from a photo, recording or live talking goes at the end of the notes.
  function addText(text, { inline } = {}) {
    setNotes((current) => {
      const joined = !current.trim() ? text : `${current.trimEnd()}${inline ? ' ' : '\n'}${text}`;
      return joined.slice(0, NOTES_CAP);
    });
  }
  const finished = fed && !writing;
  const hasScans = palace.rooms.some((r) => r.type === 'splat');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function hatch() {
    if (spots.some((s) => s.fact) && !window.confirm('Replace your current friends with new ones?')) return;
    setError('');
    setWriting(true);
    try {
      const updated = await api.fill(palace.id, notes, style, readPrefs().flavor);
      setPalace(updated);
      setFed(true);
      onReady?.(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setWriting(false);
      refreshUsage();
    }
  }

  // What each row in the "Hatching..." list shows.
  function rowFor(spot) {
    if (writing) return { state: 'hatching', detail: 'Hatching: dreaming up a scene…' };
    if (!spot.fact) return { state: 'egg', detail: fed ? 'Stays an egg (more stops than ideas)' : 'Still an egg' };
    return { state: 'awake', detail: spot.fact };
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      {CONFETTI.map(([x, y], i) => (
        <span key={i} className={`confetti ${i % 2 ? 'strip' : 'dot'}`}
          style={{ left: `${x}%`, top: `${y}%`, background: CONFETTI_COLORS[i % 5], transform: `rotate(${i * 37}deg)` }} />
      ))}

      <div className="modal" role="dialog" aria-label="Fill your palace from notes" onClick={(e) => e.stopPropagation()}>
        <div className="feed-card">
          <div className="feed-head">
            <div>
              <h2 className="card-title big">Feed your palace</h2>
              <span className="scrawl subtitle">it turns notes into little friends</span>
            </div>
            <button className="round-btn small" aria-label="Close" onClick={onClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>

          {writing ? <Hatching /> : finished ? (
            <Ready palace={palace} report={report} onWander={onDone} onQuiz={onQuiz} onAgain={() => setFed(false)} />
          ) : (
            <>
            <div className="field-label-row">
              <label htmlFor="notes" className="field-label">Paste what you need to remember</label>
              <button className="link" onClick={() => setNotes(SAMPLE_NOTES)}>try sample notes</button>
            </div>
            <textarea id="notes" className="notes" value={notes} maxLength={NOTES_CAP} onChange={(e) => setNotes(e.target.value)}
              placeholder="Paste your study notes here, or use one of the buttons below to snap or talk them in…" />
            <NotesImport onText={addText} scansLeft={left('import')} onUsed={refreshUsage}
              counter={
                <span className={`char-count ${notes.length > NOTES_CAP * 0.9 ? 'near' : ''}`}>
                  {notes.length.toLocaleString()} / {NOTES_CAP.toLocaleString()}
                </span>
              } />

            <div className="style-line" role="radiogroup" aria-label="Picture style">
              <span className="field-label">Pictures</span>
              {STYLES.map((s) => (
                <button key={s.id} role="radio" aria-checked={style === s.id}
                  className={`style-btn small ${style === s.id ? 'on' : ''}`} onClick={() => setStyle(s.id)}>
                  {s.label}
                </button>
              ))}
            </div>

            {error && <p className="error-text">{error}</p>}

            <button className="btn accent big" disabled={!notes.trim() || !palace.rooms.length || left('fill') === 0} onClick={hatch}>
              <Sparkle size={20} /> Hatch my palace
            </button>
            {left('fill') !== null && (
              <span className="hint-text center-text">{left('fill')} of {usage.fill.limit} fills left today · takes about half a minute</span>
            )}
            </>
          )}
        </div>

        <div className="hatch-card">
          <span className="card-title">
            {writing ? 'Hatching...' : finished ? 'All hatched!' : 'Your eggs'}
          </span>
          <span className="scrawl subtitle">each one pops into your room when ready</span>
          {!fed && !writing && (
            <div className="how-fill">
              <p>Your notes get cut into small ideas, <strong>one per stop</strong>. New stops are found in your
                panoramas as needed{spots.some((s) => !s.auto) ? '; eggs you planted go first' : ''}.</p>
              <p>Each stop gets a weird little scene and a picture, drawn when you first visit it.</p>
            </div>
          )}
          <ol className="hatch-list">
            {spots.map((spot, i) => {
              const row = rowFor(spot);
              return (
                <li key={spot.id}>
                  <Creature number={i + 1} state={row.state} />
                  <div className="hatch-text">
                    <span className="hatch-place">{i + 1} · {placeName(spot, i + 1)}</span>
                    <span className="hatch-detail">{row.detail}</span>
                  </div>
                </li>
              );
            })}
          </ol>
          {finished && report && <FillReport report={report} hasScans={hasScans} />}
        </div>
      </div>
    </div>
  );
}

// After filling: how the notes were split, and what to do if they need more stops than the rooms have.
function FillReport({ report, hasScans }) {
  const { ideas, yourStops, foundStops, waiting } = report;
  return (
    <div className={`fill-report ${waiting.length ? 'short' : ''}`}>
      <p>
        <strong>{ideas} idea{ideas === 1 ? '' : 's'}</strong> in your notes → {yourStops + foundStops} stops
        ({yourStops} already placed, {foundStops} found in your panoramas).
      </p>
      {waiting.length > 0 && (
        <>
          <p>
            <strong>{waiting.length} more idea{waiting.length === 1 ? '' : 's'} need a stop.</strong> Cramming two ideas into one
            stop makes both blurry, so instead: add a panorama of the next room along your route
            {hasScans ? ', plant eggs in your 3D scan,' : ''} or plant eggs on smaller objects (a light switch, a poster).
            Then fill again.
          </p>
          <ul>
            {waiting.slice(0, 3).map((idea) => <li key={idea}>{idea}</li>)}
            {waiting.length > 3 && <li>…and {waiting.length - 3} more</li>}
          </ul>
        </>
      )}
    </div>
  );
}

// While Gemini works: what's happening, and how long it's been (it can take half a minute).
const STAGES = ['Reading your notes…', 'Cutting them into ideas…', 'Finding stops in your rooms…', 'Writing a weird scene for each stop…', 'Almost there…'];

function Hatching() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const stage = STAGES[Math.min(STAGES.length - 1, Math.floor(seconds / 6))];
  return (
    <div className="hatching-panel" role="status" aria-live="polite">
      <div className="hatching-eggs" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => <Creature key={n} number={n} state="hatching" size="md" />)}
      </div>
      <h3 className="card-title big">Hatching your palace</h3>
      <p className="hatching-stage">{stage}</p>
      <p className="hint-text">{seconds}s · a whole chapter takes about half a minute. You can keep this open or close it; we’ll tell you when it’s ready.</p>
    </div>
  );
}

// Done: impossible to miss, with the next step right there.
function Ready({ palace, report, onWander, onQuiz, onAgain }) {
  const friends = palace.spots.filter((s) => s.fact).length;
  const rooms = new Set(palace.spots.filter((s) => s.fact).map((s) => s.roomId)).size;
  return (
    <div className="ready-panel" role="status" aria-live="polite">
      <div className="hatching-eggs" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => <Creature key={n} number={n} state="happy" size="md" />)}
      </div>
      <h3 className="card-title huge">Your palace is ready!</h3>
      <p>{friends} friend{friends === 1 ? '' : 's'} hatched across {rooms} room{rooms === 1 ? '' : 's'}.
        {report?.waiting?.length ? ` ${report.waiting.length} more idea${report.waiting.length === 1 ? '' : 's'} need a stop (see the right).` : ''}</p>
      <button className="btn accent big" autoFocus onClick={onWander}>Go wander and meet them →</button>
      <div className="btn-row">
        <button className="btn ghost" onClick={onQuiz}>Quiz me right away</button>
        <button className="btn ghost" onClick={onAgain}>Change the notes</button>
      </div>
    </div>
  );
}
