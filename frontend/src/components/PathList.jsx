import Creature from './Creature.jsx';
import { hatchedPath, placeName } from '../lib/path.js';

// "Your path": the left sidebar in Build and Wander. In Build it's also where you
// rename, reorder and delete spots.
export default function PathList({ palace, mode, selectedId, friendState, onSelect, onRename, onMove, onRemove }) {
  const editing = mode === 'build';
  const { spots } = palace;
  const hatched = hatchedPath(palace).length;

  const subtitle = editing
    ? 'click your room to plant eggs'
    : `${hatched} little friend${hatched === 1 ? '' : 's'}${palace.name ? ` · ${palace.name}` : ''}`;

  return (
    <aside className="path-card">
      <h2 className="card-title">Your path</h2>
      <span className="scrawl subtitle">{subtitle}</span>

      {spots.length === 0 && (
        <p className="empty-note">
          {palace.rooms.length
            ? 'Click spots in your room, in the order you’d walk past them. Each one becomes a friend that holds one fact.'
            : 'Add a photo or a 3D scan of a room you know well to begin.'}
        </p>
      )}

      <ol className="path-list">
        {spots.map((spot, i) => {
          const number = i + 1;
          const clickable = editing || spot.fact;
          return (
            <li key={spot.id}>
              <div
                className={`path-row ${spot.id === selectedId ? 'on' : ''} ${clickable ? 'clickable' : 'dim'}`}
                onClick={() => clickable && onSelect(spot)}
              >
                <Creature number={number} state={friendState(spot)} />
                <div className="path-text">
                  {editing ? (
                    <span className="path-place">
                      {number} ·
                      <input
                        key={spot.label}
                        defaultValue={spot.label ?? ''}
                        placeholder="name this spot"
                        aria-label={`Name of spot ${number}`}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => onRename(spot, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                      />
                    </span>
                  ) : (
                    <span className="path-place">{number} · {placeName(spot, number)}</span>
                  )}
                  <span className="path-fact">{spot.fact ?? (editing ? 'an egg, waiting for notes' : 'still an egg')}</span>
                </div>
                {editing && (
                  <div className="path-actions" onClick={(e) => e.stopPropagation()}>
                    <button title="Move earlier" disabled={i === 0} onClick={() => onMove(i, -1)}>↑</button>
                    <button title="Move later" disabled={i === spots.length - 1} onClick={() => onMove(i, 1)}>↓</button>
                    <button title="Delete" className="danger" onClick={() => onRemove(spot)}>×</button>
                  </div>
                )}
              </div>
              {i < spots.length - 1 && <div className="path-connector" />}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
