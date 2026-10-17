import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Creature from './Creature.jsx';
import SpotImage from './SpotImage.jsx';
import { hatchedPath, placeName } from '../lib/path.js';

// Quiz: visit each friend with its fact hidden, asking both ways (alternating):
//   "What lives at your desk?"        → type it; Gemini grades the guess
//   "Where did you put photosynthesis?" → tap the right friend in 3D, or pick a place
// Right → the friend bounces. Wrong → it falls asleep, and Gemini dreams up a
// weirder scene + picture in the background so you can wake it up later.
// `results` ({ spotId: true/false }, or null before starting) lives in PalaceEditor
// because the 3D sprites and the score in the header need it too.
const questionKind = (index) => (index % 2 === 1 ? 'where' : 'what');

// The right place plus up to 3 others, mixed in a fixed order (same every time for a question).
function placeChoices(path, index) {
  const others = path.filter((_, i) => i !== index);
  const start = index % Math.max(1, others.length);
  const choices = [...others.slice(start), ...others.slice(0, start)].slice(0, 3);
  choices.splice(index % (choices.length + 1), 0, path[index]);
  return choices;
}

export default function QuizCard({ palace, images, updateSpot, run, results, setResults, goToSpot, onWake, setFriendPicker }) {
  const path = hatchedPath(palace);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [graded, setGraded] = useState(null); // { correct, feedback } for the current friend
  const [showPicture, setShowPicture] = useState(false);
  const [rewriting, setRewriting] = useState({}); // spotId → true while Gemini rewrites it

  const done = results && Object.keys(results).length === path.length && !graded;
  const sleepers = path.filter(({ spot }) => results?.[spot.id] === false);

  function askAt(i) {
    setIndex(i);
    setAnswer('');
    setGraded(null);
    setShowPicture(false);
    // "What lives here?" walks you to the friend. "Where did you put it?" can't, it'd give it away.
    if (questionKind(i) === 'what') goToSpot(path[i].spot);
  }

  function start() {
    setResults({});
    askAt(0);
  }

  async function reimagine(spot) {
    setRewriting((r) => ({ ...r, [spot.id]: true }));
    try {
      updateSpot(await api.makeWeirder(palace.id, spot.id));
      images.enqueue([spot.id]);
    } catch (err) {
      console.error('Re-imagining failed:', err);
    } finally {
      setRewriting((r) => ({ ...r, [spot.id]: false }));
    }
  }

  // guess: { answer: "typed text" } or { placeId: spotId they picked }
  async function submit(guess) {
    const { spot } = path[index];
    const result = await run('Checking your guess…', () => api.grade(palace.id, spot.id, guess));
    if (!result) return;
    if (questionKind(index) === 'where') goToSpot(spot); // now show where it really lives
    setGraded(result);
    setResults((r) => ({ ...r, [spot.id]: result.correct }));
    if (!result.correct) reimagine(spot); // no await: it runs while you keep going
  }

  function next() {
    if (index < path.length - 1) askAt(index + 1);
    else setGraded(null); // all answered → results screen
  }

  // During a "where" question, tapping a friend in the 3D room answers it.
  const kind = questionKind(index);
  useEffect(() => {
    if (!results || graded || kind !== 'where' || !path[index]) return undefined;
    setFriendPicker(() => (spot) => submit({ placeId: spot.id }));
    return () => setFriendPicker(null);
  }, [results, graded, kind, index]);

  // After grading, Enter moves on (the guess box is disabled, so it can't hold focus).
  useEffect(() => {
    if (!graded) return undefined;
    const onKey = (e) => {
      if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!path.length) {
    return (
      <div className="float-card quiz-card">
        <h2 className="card-title big">Nobody to quiz yet</h2>
        <p className="scrawl">fill your palace from notes first</p>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="float-card quiz-card">
        <span className="chip green">{path.length} friends to visit</span>
        <h2 className="card-title big">Ready to visit your friends?</h2>
        <p>They’ll hide their facts. At each stop, say who lives there.</p>
        <button className="btn ink wide" onClick={start}>Start the quiz</button>
        <p className="scrawl">right answers make them bounce, misses put them to sleep</p>
      </div>
    );
  }

  const sleeperStatus = (spot) => {
    if (rewriting[spot.id]) return 'dreaming…';
    const status = images.status[spot.id];
    if (status === 'queued' || status === 'working') return 'drawing its new picture…';
    if (status === 'error') return 'new scene ready (picture failed)';
    return 'new scene ready';
  };

  if (done) {
    const happy = path.length - sleepers.length;
    return (
      <div className="float-card quiz-card">
        <span className="chip green">Quiz done</span>
        <h2 className="card-title big">{happy} / {path.length} happy friends</h2>
        {sleepers.length === 0 ? (
          <p className="scrawl">everyone’s bouncing. your palace works!</p>
        ) : (
          <>
            <p>These friends fell asleep. Each one has dreamed up a weirder scene to wake up to:</p>
            <ul className="sleeper-list">
              {sleepers.map(({ spot, number }) => (
                <li key={spot.id}>
                  <Creature number={number} state="sleepy" />
                  <span><strong>{number} · {placeName(spot, number)}</strong>
                    <small>{sleeperStatus(spot)}</small>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="btn-row">
          {sleepers.length > 0 && (
            <button className="btn ghost" onClick={() => onWake(sleepers[0].spot)}>Wake them up</button>
          )}
          <button className="btn ink" onClick={start}>Quiz again</button>
        </div>
      </div>
    );
  }

  const { spot, number } = path[index];
  const place = placeName(spot, number);
  const where = kind === 'where';
  return (
    <div className="float-card quiz-card">
      <span className="chip green">Friend {index + 1} of {path.length}{where && !graded ? '' : ` · ${place}`}</span>

      {where ? (
        <>
          <h2 className="card-title big">Where did you put this?</h2>
          <div className="sticky"><p>{spot.fact}</p></div>
          {!graded && (
            <>
              <span className="field-label">Tap its friend in the room, or pick a place:</span>
              <div className="choice-row">
                {placeChoices(path, index).map((c) => (
                  <button key={c.spot.id} className="style-btn" onClick={() => submit({ placeId: c.spot.id })}>
                    {c.number} · {placeName(c.spot, c.number)}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <>
      <h2 className="card-title big">Who lives at your {place}?</h2>
      <label htmlFor="guess" className="field-label">Your guess</label>
      <input
        id="guess"
        className="pill-input"
        autoFocus
        autoComplete="off"
        value={answer}
        disabled={!!graded}
        onChange={(e) => setAnswer(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && answer.trim() && !graded && submit({ answer })}
        placeholder="type what you remember…"
      />
        </>
      )}

      {graded && (
        <div className={`sticky ${graded.correct ? '' : 'sleepy'}`}>
          <span className="sticky-title">{graded.correct ? 'Nailed it!' : 'Zzz… they fell asleep'}</span>
          <p>{graded.feedback}</p>
        </div>
      )}

      {showPicture && (
        <SpotImage palaceId={palace.id} spot={spot} status={images.status[spot.id]} className="quiz-photo" />
      )}

      {graded ? (
        <div className="btn-row">
          <button className="btn ghost" onClick={() => setShowPicture((v) => !v)}>
            {showPicture ? 'Hide picture' : 'See its picture'}
          </button>
          <button className="btn ink" autoFocus onClick={next}>
            {index < path.length - 1 ? 'Next friend' : 'See results'}
          </button>
        </div>
      ) : (
        <div className="btn-row">
          <button className="btn ghost" onClick={() => submit(where ? { placeId: null } : { answer: '' })}>I forgot</button>
          {!where && <button className="btn ink" disabled={!answer.trim()} onClick={() => submit({ answer })}>Check</button>}
        </div>
      )}
      {!graded && !showPicture && !where && (
        <button className="link" onClick={() => setShowPicture(true)}>peek at the picture</button>
      )}

      {sleepers.length > 0 && (
        <p className="scrawl">
          {sleepers.length} friend{sleepers.length > 1 ? 's' : ''} fell asleep. Wake them up later with a weirder scene!
        </p>
      )}
    </div>
  );
}
