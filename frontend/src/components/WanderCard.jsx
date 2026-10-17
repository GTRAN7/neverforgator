import { useEffect } from 'react';
import SpotImage from './SpotImage.jsx';
import { Sparkle } from './Creature.jsx';
import { hatchedPath } from '../lib/path.js';

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

  // Pictures are drawn on the way: this friend and the next two, each only once (then cached).
  // So you only pay for pictures of friends you actually visit.
  useEffect(() => {
    const ahead = path.slice(index, index + 3).map(({ spot }) => spot)
      .filter((spot) => spot.imagePrompt && !spot.image && !images.status[spot.id]);
    if (ahead.length) images.enqueue(ahead.map((spot) => spot.id));
  }, [current?.spot.id, current?.spot.imagePrompt]);

  const go = (i) => goToSpot(path[Math.max(0, Math.min(path.length - 1, i))].spot);

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
      <div className="float-card note-card">
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
    <div className="float-card polaroid" key={spot.id}>
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
