import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Creature from './Creature.jsx';
import SpotImage from './SpotImage.jsx';
import { hatchedPath, placeName } from '../lib/path.js';
import { checkAnswer } from '../lib/grade.js';

// Quiz: visit each friend in path order with its fact hidden, asking both ways (alternating):
//   "What lives at your desk?"        → type it; checked instantly in the browser
//   "Where did you put photosynthesis?" → tap the right friend in 3D, or pick a place
// Like memory athletes, you check yourself: if the key words don't clearly match, you see the
// real fact and say whether you had it. Right → the friend bounces. Wrong → it falls asleep, and
// Gemini dreams up a weirder scene in the background so you can wake it up later.
// At the end the score sets the next spaced review (see /reviews in the backend).
// `results` ({ spotId: true/false }, or null before starting) lives in PalaceEditor
// because the 3D sprites and the score in the header need it too.
// "in 3 days", "tomorrow", "in 10 minutes"
function whenText(iso) {
  const minutes = Math.round((new Date(iso) - Date.now()) / 60000);
  if (minutes < 60) return `in ${Math.max(1, minutes)} minutes: walk the sleepy friends, then quiz again`;
  const days = Math.round(minutes / 1440);
  return days <= 1 ? 'tomorrow' : `in ${days} days`;
}

const questionKind = (index) => (index % 2 === 1 ? 'where' : 'what');

// The right place plus up to 3 others, mixed in a fixed order (same every time for a question).
function placeChoices(path, index) {
  const others = path.filter((_, i) => i !== index);
  const start = index % Math.max(1, others.length);
  const choices = [...others.slice(start), ...others.slice(0, start)].slice(0, 3);
  choices.splice(index % (choices.length + 1), 0, path[index]);
  return choices;
}

export default function QuizCard({ palace, images, updateSpot, results, setResults, goToSpot, onWake, setFriendPicker }) {
  const path = hatchedPath(palace);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [graded, setGraded] = useState(null); // { correct, feedback } for the current friend
  const [showPicture, setShowPicture] = useState(false);
  const [rewriting, setRewriting] = useState({}); // spotId → true while Gemini rewrites it
  const [nextReviewAt, setNextReviewAt] = useState(null); // set when the quiz is finished

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
    setNextReviewAt(null);
    askAt(0);
  }

  async function reimagine(spot) {
    setRewriting((r) => ({ ...r, [spot.id]: true }));
    try {
      updateSpot(await api.makeWeirder(palace.id, spot.id)); // its new picture is drawn when you wander past
    } catch (err) {
      console.error('Re-imagining failed:', err);
    } finally {
      setRewriting((r) => ({ ...r, [spot.id]: false }));
    }
  }

  // Show the verdict right away. correct: true / false, or null = "close, you decide".
  function settle(correct, feedback) {
    const { spot } = path[index];
    if (questionKind(index) === 'where') goToSpot(spot); // now show where it really lives
    setGraded({ correct, feedback });
    if (correct !== null) setResults((r) => ({ ...r, [spot.id]: correct }));
  }

  // guess: { answer: "typed text" } or { placeId: spotId they picked }
  function submit(guess) {
    const { spot, number } = path[index];
    if ('placeId' in guess) {
      const place = `${number} · ${placeName(spot, number)}`;
      settle(guess.placeId === spot.id, guess.placeId === spot.id ? `Yes! It lives at ${place}.` : `It actually lives at ${place}.`);
      return;
    }
    const verdict = guess.answer.trim() ? checkAnswer(spot.fact, guess.answer, spot.keyTerms) : 'wrong';
    if (verdict === 'right') settle(true, spot.fact);
    else if (verdict === 'close') settle(null, spot.fact);
    else settle(false, spot.fact);
  }

  // Moving on saves the result. Only then does a miss get its weirder scene, so you can
  // still overrule the verdict ("I had it") without paying for a rewrite.
  function next() {
    const { spot } = path[index];
    const correct = results[spot.id];
    if (correct === undefined) return; // still deciding a "close" answer
    // A shared example can be quizzed, but not changed: no scores, no rewritten scenes.
    if (!palace.readOnly) {
      api.recordResult(palace.id, spot.id, correct).catch((e) => console.error('Saving result failed:', e));
      if (!correct) reimagine(spot); // no await: it runs while you keep going
    }
    if (index < path.length - 1) {
      askAt(index + 1);
      return;
    }
    setGraded(null); // all answered → results screen
    const score = Object.values(results).filter(Boolean).length;
    if (palace.readOnly) return;
    api.addReview(palace.id, score, path.length).then((r) => setNextReviewAt(r.nextReviewAt)).catch(() => {});
  }

  function overrule(correct) {
    setGraded((g) => ({ ...g, correct }));
    setResults((r) => ({ ...r, [path[index].spot.id]: correct }));
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
      // Not from the guess box: the Enter that submitted the answer would skip right past it.
      if (e.key === 'Enter' && !['BUTTON', 'INPUT'].includes(e.target.tagName) && graded.correct !== null) next();
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
    if (palace.readOnly) return 'walk past it again in Wander';
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
        {!palace.readOnly && <p className="review-note">
          <strong>Next review:</strong> {nextReviewAt ? whenText(nextReviewAt) : 'saving…'}
          <small>Memory athletes re-walk a palace after 1, 3, 7 and 21 days. Each good quiz stretches the gap.</small>
        </p>}
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
        <div className={`sticky ${graded.correct === false ? 'sleepy' : ''}`}>
          <span className="sticky-title">
            {graded.correct === null ? 'Close! Did you have it?' : graded.correct ? 'Nailed it!' : 'Zzz… they fell asleep'}
          </span>
          {!where && <span className="sticky-label">The fact</span>}
          <p>{graded.feedback}</p>
        </div>
      )}

      {showPicture && (
        <SpotImage palaceId={palace.id} spot={spot} status={images.status[spot.id]} className="quiz-photo" />
      )}

      {graded?.correct === null ? (
        <div className="btn-row">
          <button className="btn ghost" onClick={() => overrule(false)}>No, I missed it</button>
          <button className="btn ink" onClick={() => overrule(true)}>Yes, I had it</button>
        </div>
      ) : graded ? (
        <div className="btn-row">
          {!where && answer.trim() && (
            <button className="link" onClick={() => overrule(!graded.correct)}>
              {graded.correct ? 'actually, I missed it' : 'actually, I had it'}
            </button>
          )}
          <button className="btn ghost" onClick={() => setShowPicture((v) => !v)}>
            {showPicture ? 'Hide picture' : 'See its picture'}
          </button>
          <button className="btn ink" onClick={next}>
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
