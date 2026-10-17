import { useState } from 'react';
import { fileUrl } from '../api.js';
import Creature from './Creature.jsx';
import { placeName } from '../lib/path.js';

// Build mode: click an egg (or friend) to open this card. Everything it holds is visible at once;
// the less common actions (move, reorder, edit, delete) sit behind the ⋯ button.
export default function SpotCard({ palace, spot, number, moving, onRename, onMoveStart, onShift, onRemove, onEditIdea, onClose }) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(spot.fact ?? '');
  const last = number === palace.spots.length;
  const readOnly = palace.readOnly;

  const pick = (action) => () => { setMenu(false); action(); };

  return (
    <div className="float-card spot-card" key={spot.id}>
      <div className="spot-card-head">
        <Creature number={number} state={spot.fact ? 'awake' : 'egg'} />
        <span className={`chip ${number % 5 === 0 ? 'yellow' : 'green'}`}>Stop {number}</span>
        {!readOnly && (
          <button className="round-btn small" aria-label="More actions" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>⋯</button>
        )}
        <button className="round-btn small" aria-label="Close" onClick={onClose}>×</button>
        {menu && (
          <div className="card-menu" role="menu">
            <button role="menuitem" onClick={pick(onMoveStart)}>Move to another object</button>
            {spot.fact && <button role="menuitem" onClick={pick(() => setEditing(true))}>Edit the idea</button>}
            <button role="menuitem" disabled={number === 1} onClick={pick(() => onShift(-1))}>Earlier in the path</button>
            <button role="menuitem" disabled={last} onClick={pick(() => onShift(1))}>Later in the path</button>
            <button role="menuitem" className="danger" onClick={pick(onRemove)}>Delete this stop</button>
          </div>
        )}
      </div>

      <div className="spot-card-place">
        {spot.crop && <img className="spot-crop" src={fileUrl(palace.id, spot.crop)} alt="" />}
        <input
          key={spot.label}
          className="pill-input"
          aria-label="What’s here?"
          defaultValue={spot.label ?? ''}
          placeholder={placeName(spot, number)}
          readOnly={readOnly}
          onBlur={(e) => onRename(spot, e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
        />
      </div>

      {moving && (
        <p className="moving-note">Click the new spot in your room… <button className="link" onClick={onMoveStart}>cancel</button></p>
      )}

      {editing ? (
        <form className="idea-edit" onSubmit={(e) => { e.preventDefault(); onEditIdea(draft); setEditing(false); }}>
          <textarea value={draft} maxLength={300} onChange={(e) => setDraft(e.target.value)} aria-label="The idea this stop holds" />
          <div className="btn-row">
            <button type="button" className="btn ghost small" onClick={() => setEditing(false)}>Cancel</button>
            <button type="submit" className="btn ink small" disabled={!draft.trim() || draft === spot.fact}>Save + new scene</button>
          </div>
        </form>
      ) : spot.fact ? (
        <>
          <div className="sticky">
            <span className="sticky-label">Holds</span>
            <p>{spot.fact}</p>
          </div>
          <p className="scrawl scene-text">{spot.scene}</p>
          {spot.hook && <span className="hook">hook: {spot.hook}</span>}
        </>
      ) : (
        <p className="hint-text">An empty egg. “Fill from notes” gives it an idea to hold.</p>
      )}
    </div>
  );
}
