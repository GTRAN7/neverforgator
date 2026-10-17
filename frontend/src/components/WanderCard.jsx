import { useEffect } from 'react';
import SpotImage from './SpotImage.jsx';
import { Sparkle } from './Creature.jsx';
import { hatchedPath } from '../lib/path.js';

// Wander (study): walk the path friend by friend. The camera turns to each one and
// this polaroid shows its picture, its scene, and the fact to remember.
export default function WanderCard({ palace, images, selectedId, goToSpot, onQuiz, onFeed }) {
  const path = hatchedPath(palace);
  const found = path.findIndex(({ spot }) => spot.id === selectedId);
  const index = Math.max(0, found);
  const current = path[index];
  const last = index === path.length - 1;

  // Entering Wander: walk to the first friend (unless we're already at one).
  useEffect(() => {
    if (found === -1 && path.length) goToSpot(path[0].spot);
  }, []);

  // If this friend has no picture yet (e.g. the page was reloaded mid-generation), draw it now.
  useEffect(() => {
    const spot = current?.spot;
    if (spot?.imagePrompt && !spot.image && !images.status[spot.id]) images.enqueue([spot.id]);
  }, [current?.spot.id]);

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
        <h2 className="card-title">No friends yet</h2>
        <p className="scrawl">feed your palace some notes and they’ll hatch right here in your room</p>
        <button className="btn accent" onClick={onFeed}><Sparkle /> Fill from notes</button>
      </div>
    );
  }

  const { spot } = current;
  return (
    <div className="float-card polaroid" key={spot.id}>
      <div className="tape" />
      <SpotImage palaceId={palace.id} spot={spot} status={images.status[spot.id]}
        onRetry={() => images.enqueue([spot.id])} className="polaroid-photo" />
      <p className="scrawl scene-text">{spot.scene}</p>
      <div className="sticky">
        <span className="sticky-label">Remember this</span>
        <p>{spot.fact}</p>
      </div>
      <div className="btn-row">
        <button className="btn ghost" disabled={index === 0} onClick={() => go(index - 1)}>Back</button>
        {last
          ? <button className="btn ink" onClick={onQuiz}>Quiz me!</button>
          : <button className="btn ink" onClick={() => go(index + 1)}>Next friend</button>}
      </div>
      <span className="card-foot">{index + 1} of {path.length} · ← → keys work too</span>
    </div>
  );
}
