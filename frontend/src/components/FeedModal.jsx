import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Creature, { Sparkle } from './Creature.jsx';
import { placeName } from '../lib/path.js';

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

// "Feed your palace": paste notes → Gemini splits them into one fact per spot and
// writes a scene for each → pictures are drawn a few at a time ("hatching").
export default function FeedModal({ palace, setPalace, images, sketchesOnly, onClose, onDone }) {
  const [notes, setNotes] = useState(palace.notes ?? '');
  const [style, setStyle] = useState(palace.style ?? 'storybook');
  const [drawPictures, setDrawPictures] = useState(true);
  const [writing, setWriting] = useState(false); // waiting for Gemini to write the scenes
  const [fed, setFed] = useState(false); // scenes written during this visit
  const [error, setError] = useState('');

  const { spots } = palace;
  const emptySpots = spots.filter((s) => !s.fact).length;
  const pending = spots.filter((s) => ['queued', 'working'].includes(images.status[s.id])).length;
  const failed = spots.filter((s) => images.status[s.id] === 'error').length;
  const finished = fed && !writing && pending === 0;

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
      const updated = await api.fill(palace.id, notes, style);
      setPalace(updated);
      setFed(true);
      if (drawPictures) images.enqueue(updated.spots.filter((s) => s.imagePrompt && !s.image).map((s) => s.id));
    } catch (e) {
      setError(e.message);
    } finally {
      setWriting(false);
    }
  }

  // What each row in the "Hatching..." list shows.
  function rowFor(spot) {
    const status = images.status[spot.id];
    if (writing) return { state: 'hatching', detail: 'Hatching: dreaming up a scene…' };
    if (!spot.fact) return { state: 'egg', detail: fed ? 'Stays an egg (not enough notes)' : 'Still an egg' };
    if (status === 'queued' || status === 'working') return { state: 'hatching', detail: `Hatching: ${spot.scene}` };
    if (status === 'error') return { state: 'awake', detail: 'No picture yet. Tap to try again.', retry: true };
    return { state: 'awake', detail: spot.scene };
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
              <h2 className="card-title huge">Feed your palace</h2>
              <span className="scrawl subtitle">it turns notes into little friends</span>
            </div>
            <button className="round-btn" aria-label="Close" onClick={onClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>

          <div className="field-label-row">
            <label htmlFor="notes" className="field-label">Paste what you need to remember</label>
            <button className="link" onClick={() => setNotes(SAMPLE_NOTES)}>try sample notes</button>
          </div>
          <textarea id="notes" className="notes" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Paste your study notes here…" />

          <div className="chip-row">
            <span className="chip yellow">
              {emptySpots === spots.length
                ? `${spots.length} empty spot${spots.length === 1 ? '' : 's'} waiting`
                : `${spots.length} spots · ${spots.length - emptySpots} already hatched`}
            </span>
            <label className="chip green check">
              <input type="checkbox" checked={drawPictures} onChange={(e) => setDrawPictures(e.target.checked)} />
              {sketchesOnly ? 'Sketch placeholders (real pictures later)' : 'Draw pictures (made once, saved)'}
            </label>
          </div>

          <span className="field-label">Picture style</span>
          <div className="style-row" role="radiogroup" aria-label="Picture style">
            {STYLES.map((s) => (
              <button key={s.id} role="radio" aria-checked={style === s.id}
                className={`style-btn ${style === s.id ? 'on' : ''}`} onClick={() => setStyle(s.id)}>
                {s.label}
              </button>
            ))}
          </div>

          {error && <p className="error-text">{error}</p>}

          {finished ? (
            <button className="btn accent big" onClick={onDone}>Go wander →</button>
          ) : (
            <button className="btn accent big" disabled={!notes.trim() || writing || !spots.length} onClick={hatch}>
              <Sparkle size={20} /> {writing ? 'Hatching…' : `Hatch ${spots.length} memories`}
            </button>
          )}
        </div>

        <div className="hatch-card">
          <span className="card-title">
            {writing || pending ? 'Hatching...' : finished ? (failed ? 'Hatched, but pictures failed' : 'All hatched!') : 'Your eggs'}
          </span>
          <span className="scrawl subtitle">each one pops into your room when ready</span>
          <ol className="hatch-list">
            {spots.map((spot, i) => {
              const row = rowFor(spot);
              return (
                <li key={spot.id} className={row.retry ? 'clickable' : ''}
                  onClick={row.retry ? () => images.enqueue([spot.id]) : undefined}>
                  <Creature number={i + 1} state={row.state} />
                  <div className="hatch-text">
                    <span className="hatch-place">{i + 1} · {placeName(spot, i + 1)}</span>
                    <span className="hatch-detail">{row.detail}</span>
                  </div>
                </li>
              );
            })}
          </ol>
          {failed > 0 && images.lastError && (
            <p className="hatch-error">
              <strong>Why no pictures:</strong> {images.lastError.split('\n')[0]}
              <br />Your friends still work without them, and you can retry any time.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
