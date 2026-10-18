import { useEffect, useRef, useState } from 'react';
import SpotImage from './SpotImage.jsx';
import { Sparkle } from './Creature.jsx';
import { hatchedPath } from '../lib/path.js';

// Where the card sits and how big it is: dragged and resized by the user, remembered in this browser
// (the card is rebuilt for every friend, so it reads this back each time).
const PLACE_KEY = 'neverforgator-wander-card';
const MIN_SCALE = 0.6;
const MAX_SCALE = 1.4;
function readPlace() {
  try {
    const saved = JSON.parse(localStorage.getItem(PLACE_KEY));
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) && Number.isFinite(saved.scale)) return saved;
  } catch { /* nothing saved, or storage blocked */ }
  return { x: 0, y: 0, scale: 1 };
}
function savePlace(place) {
  try { localStorage.setItem(PLACE_KEY, JSON.stringify(place)); } catch { /* storage blocked: just for this visit */ }
}

// Drag the card by any empty spot to move it; drag the corner handle to shrink or grow it evenly.
// It always stays inside the room view, so its handle and buttons can't end up out of reach.
const EDGE = 8; // px kept between the card and the room view's edge
const clamp = (v, a, b) => Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b));

function useMovableCard() {
  const [place, setPlace] = useState(readPlace);
  const cardRef = useRef(null);

  // The card's box and the room view's box, right now.
  const measure = () => {
    const card = cardRef.current;
    return card && { box: card.getBoundingClientRect(), frame: card.parentElement.getBoundingClientRect() };
  };
  // How far the card may move from where it is and still be inside the room view.
  const room = ({ box, frame }) => ({
    x: [frame.left + EDGE - box.left, frame.right - EDGE - box.right],
    y: [frame.top + EDGE - box.top, frame.bottom - EDGE - box.bottom],
  });

  function follow(e, change) {
    e.preventDefault(); // no text selection while dragging
    const start = { x: e.clientX, y: e.clientY, place, ...measure() };
    let latest = place;
    const move = (ev) => { latest = change(start, ev); setPlace(latest); };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      savePlace(latest);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  // A saved spot can be off-screen after the window got smaller: bring the card back in.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const now = measure();
      if (!now) return;
      const r = room(now);
      const dx = clamp(0, ...r.x);
      const dy = clamp(0, ...r.y);
      if (dx || dy) setPlace((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Buttons and links still work as usual.
  const onMoveStart = (e) => {
    if (e.button !== 0 || e.target.closest('button, a, input, textarea, .card-resize')) return;
    follow(e, (s, ev) => {
      const r = room(s);
      return {
        ...s.place,
        x: s.place.x + clamp(ev.clientX - s.x, ...r.x),
        y: s.place.y + clamp(ev.clientY - s.y, ...r.y),
      };
    });
  };
  // The handle is the bottom-right corner and the top-left corner stays put: pulling the handle
  // down or right makes the card bigger, up or left smaller, evenly, and never past the room view.
  const onResizeStart = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    follow(e, (s, ev) => {
      const { box, frame } = s;
      const size = Math.hypot(box.width, box.height);
      const grow = ((ev.clientX - s.x) * box.width + (ev.clientY - s.y) * box.height) / (size * size);
      const fits = s.place.scale * Math.min((frame.bottom - EDGE - box.top) / box.height, (frame.right - EDGE - box.left) / box.width);
      const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, fits, s.place.scale * (1 + grow)));
      return { ...s.place, scale: Math.round(scale * 100) / 100 };
    });
  };
  const reset = () => { const p = { x: 0, y: 0, scale: 1 }; setPlace(p); savePlace(p); };

  const style = { transform: `translate(${place.x}px, ${place.y}px) scale(${place.scale}) rotate(2deg)` };
  return { cardRef, style, onMoveStart, onResizeStart, reset };
}

function ResizeHandle({ onPointerDown, onReset }) {
  return (
    <button className="card-resize" aria-label="Resize the card (double-click to reset)" title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown} onDoubleClick={onReset}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M14 6L6 14M14 11l-3 3" /></svg>
    </button>
  );
}

// Wander (study): walk the path friend by friend. The camera turns to each one and
// this polaroid shows its picture, its scene, and the fact to remember.
export default function WanderCard({ palace, images, selectedId, goToSpot, onQuiz, onFeed, onClose }) {
  const path = hatchedPath(palace);
  const found = path.findIndex(({ spot }) => spot.id === selectedId);
  const index = Math.max(0, found);
  const current = path[index];
  const last = index === path.length - 1;

  // Entering Wander: walk to the first friend (unless we're already at one).
  useEffect(() => {
    if (found === -1 && path.length) goToSpot(path[0].spot);
  }, []);

  // Pictures are drawn on the way: this friend and the next three (one batch, one Gemini call),
  // each only once (then saved). So you only pay for pictures of friends you actually visit.
  useEffect(() => {
    const ahead = path.slice(index, index + 4).map(({ spot }) => spot)
      .filter((spot) => spot.imagePrompt && !spot.image && !images.status[spot.id]);
    if (ahead.length) images.enqueue(ahead.map((spot) => spot.id));
  }, [current?.spot.id, current?.spot.imagePrompt]);

  const go = (i) => goToSpot(path[Math.max(0, Math.min(path.length - 1, i))].spot);
  const { cardRef, style: cardStyle, onMoveStart, onResizeStart, reset: resetCard } = useMovableCard();

  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === 'ArrowRight') go(index + 1);
      if (e.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!current) {
    return (
      <div className="float-card note-card movable-card" ref={cardRef} style={cardStyle} onPointerDown={onMoveStart}>
        <ResizeHandle onPointerDown={onResizeStart} onReset={resetCard} />
        <button className="round-btn small card-close" aria-label="Close" onClick={onClose}>×</button>
        <h2 className="card-title">No friends yet</h2>
        <p className="scrawl">feed your palace some notes and they’ll hatch right here in your room</p>
        <button className="btn accent" onClick={onFeed}><Sparkle /> Fill from notes</button>
      </div>
    );
  }

  const { spot } = current;
  // The next friend lives in another room: say so, so the walk between rooms is part of the route.
  const nextSpot = path[index + 1]?.spot;
  const nextRoom = nextSpot && nextSpot.roomId !== spot.roomId ? palace.rooms.find((r) => r.id === nextSpot.roomId) : null;
  return (
    <div className="float-card polaroid movable-card" key={spot.id} ref={cardRef} style={cardStyle}
      onPointerDown={onMoveStart}>
      <ResizeHandle onPointerDown={onResizeStart} onReset={resetCard} />
      <div className="tape" />
      <button className="round-btn small card-close" aria-label="Close" title="Close (click a friend to bring it back)" onClick={onClose}>×</button>
      <SpotImage palaceId={palace.id} spot={spot} status={images.status[spot.id]}
        onRetry={() => images.enqueue([spot.id])} className="polaroid-photo" />
      <p className="scrawl scene-text">{spot.scene}</p>
      {spot.hook && <span className="hook">hook: {spot.hook}</span>}
      <div className="sticky">
        <span className="sticky-label">Remember this</span>
        <p>{spot.fact}</p>
      </div>
      <div className="btn-row">
        <button className="btn ghost" disabled={index === 0} onClick={() => go(index - 1)}>Back</button>
        {last
          ? <button className="btn ink" onClick={onQuiz}>Quiz me!</button>
          : <button className="btn ink" onClick={() => go(index + 1)}>{nextRoom ? `Walk to ${nextRoom.name} →` : 'Next friend'}</button>}
      </div>
      <span className="card-foot">{index + 1} of {path.length} · ← → keys work too</span>
    </div>
  );
}
