import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Creature from './Creature.jsx';
import SpotImage from './SpotImage.jsx';
import { hatchedPath, placeName } from '../lib/path.js';
import { checkAnswer } from '../lib/grade.js';
import { readPrefs } from '../lib/prefs.js';

// Quiz, in up to two rounds (the "Quiz me by…" setting picks one or both):
//   Round 1 · Walk the path   "What fact did you leave at the desk?" in path order, like walking it in your head.
//                             Type it; it's checked instantly in the browser against the key terms.
//   Round 2 · Find it         "Where did you put photosynthesis?"   shuffled, so the order of the
//                             path can't give the answer away. Tap the friend in 3D or pick a place.
// Like memory athletes, you check yourself: if only some key terms match, you see the fact and say
// whether you had it, and you can always overrule a verdict. A friend bounces if you got all of
// its questions right; otherwise it falls asleep and Gemini dreams up a weirder scene for it.
// At the end the score is saved (quiz attempts).
// `results` ({ spotId: true/false }, or null before starting) lives in PalaceEditor because the
// 3D friends and the score in the header need it too.

const shuffle = (list) => list.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);
const FIND_ROUND_MAX = 6; // with both rounds, round 2 asks about a handful of friends, not all

// [{ kind: 'what' | 'where', at: index in the path }]
function makeQuestions(path) {
  const { quiz } = readPrefs();
  const walk = path.map((_, at) => ({ kind: 'what', at }));
  const find = shuffle(path.map((_, at) => ({ kind: 'where', at })));
  if (quiz === 'type') return walk;
  if (quiz === 'tap') return find;
  return [...walk, ...(path.length > 1 ? find.slice(0, FIND_ROUND_MAX) : [])];
}

// The right place plus up to 3 others, in random order.
function placeChoices(path, at) {
  const others = shuffle(path.filter((_, i) => i !== at)).slice(0, 3);
  return shuffle([...others, path[at]]);
}

export default function QuizCard({ palace, images, updateSpot, results, setResults, goToSpot, onWake, setFriendPicker }) {
  const path = hatchedPath(palace);
  const [questions, setQuestions] = useState([]);
  const [q, setQ] = useState(0); // which question
  const [answers, setAnswers] = useState({}); // question index -> true / false
  const [answer, setAnswer] = useState(''); // what was typed
  const [graded, setGraded] = useState(null); // { correct: true | false | null (close: you decide) }
  const [showPicture, setShowPicture] = useState(false);
  const [rewriting, setRewriting] = useState({}); // spotId -> true while Gemini rewrites it
  const [finished, setFinished] = useState(false);

  const question = questions[q];
  const current = question ? path[question.at] : null;
  const choices = useMemo(() => (question?.kind === 'where' ? placeChoices(path, question.at) : []), [questions, q]);
  const sleepers = path.filter(({ spot }) => results?.[spot.id] === false);
  const roundTwoStart = questions.findIndex((x) => x.kind === 'where');
  const twoRounds = roundTwoStart > 0;

  // A friend is happy if every question about it so far was right, sleepy if any was wrong.
  function setAnswerFor(index, correct) {
    const next = { ...answers, [index]: correct };
    setAnswers(next);
    const perSpot = {};
    for (const [i, ok] of Object.entries(next)) {
      const id = path[questions[i].at].spot.id;
      perSpot[id] = (perSpot[id] ?? true) && ok;
    }
    setResults(perSpot);
  }

  function ask(index, list = questions) {
    setQ(index);
    setAnswer('');
    setGraded(null);
    setShowPicture(false);
    // "What fact did you leave here?" walks you to the friend. "Where did you put it?" can't: it'd give it away.
    if (list[index].kind === 'what') goToSpot(path[list[index].at].spot);
  }

  function start() {
    const list = makeQuestions(path);
    setQuestions(list);
    setAnswers({});
    setResults({});
    setFinished(false);
    ask(0, list);
  }

  // End of the quiz: every friend that fell asleep gets a weirder scene, all in one Gemini call.
  // Its new picture is drawn when you wander past.
  async function reimagineAll(spots) {
    if (!spots.length) return;
    setRewriting(Object.fromEntries(spots.map((s) => [s.id, true])));
    try {
      (await api.makeWeirderMany(palace.id, spots.map((s) => s.id))).forEach(updateSpot);
    } catch (err) {
      console.error('Re-imagining failed:', err);
    } finally {
      setRewriting({});
    }
  }

  // correct: true / false, or null = "close, you decide"
  function settle(correct) {
    if (question.kind === 'where') goToSpot(current.spot); // now show where it really lives
    setGraded({ correct });
    if (correct !== null) setAnswerFor(q, correct);
  }

  // guess: { answer: "typed text" } or { placeId: spotId they picked }
  function submit(guess) {
    if ('placeId' in guess) {
      settle(guess.placeId === current.spot.id);
      return;
    }
    const verdict = guess.answer.trim() ? checkAnswer(current.spot.fact, guess.answer, current.spot.keyTerms) : 'wrong';
    settle(verdict === 'right' ? true : verdict === 'close' ? null : false);
  }

  function overrule(correct) {
    setGraded({ correct, overruled: true });
    setAnswerFor(q, correct);
  }

  // Moving on saves the result. Only then does a miss get its weirder scene, so you can still
  // overrule the verdict without paying for a rewrite.
  function next() {
    const correct = answers[q];
    if (correct === undefined) return; // still deciding a "close" answer
    const { spot } = current;
    // A shared example can be quizzed, but not changed: no scores, no rewritten scenes.
    if (!palace.readOnly) {
      api.recordResult(palace.id, spot.id, correct).catch((e) => console.error('Saving result failed:', e));
    }
    if (q < questions.length - 1) {
      ask(q + 1);
      return;
    }
    setFinished(true);
    setGraded(null);
    const happy = path.filter(({ spot: s }) => results?.[s.id] !== false).length;
    if (!palace.readOnly) {
      api.addReview(palace.id, happy, path.length).catch(() => {}); // keeps the score history
      reimagineAll(path.map(({ spot: s }) => s).filter((s) => results?.[s.id] === false)); // no await: shows on the results screen
    }
  }

  // Peeking draws the picture if it isn't drawn yet.
  function peek() {
    setShowPicture((v) => !v);
    const { spot } = current;
    if (spot.imagePrompt && !spot.image && !images.status[spot.id]) images.enqueue([spot.id]);
  }

  // During a "where" question, tapping a friend in the 3D room answers it.
  const kind = question?.kind;
  useEffect(() => {
    if (!results || graded || kind !== 'where' || finished) return undefined;
    setFriendPicker(() => (spot) => submit({ placeId: spot.id }));
    return () => setFriendPicker(null);
  }, [results, graded, kind, q, finished]);

  // After grading, Enter moves on (the guess box is gone, so it can't hold focus).
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
    const { quiz } = readPrefs();
    return (
      <div className="float-card quiz-card">
        <span className="chip green">{path.length} friends to visit</span>
        <h2 className="card-title big">Ready to visit your friends?</h2>
        {quiz !== 'tap' && <p><strong>Walk the path:</strong> at each stop, type the fact you left there.</p>}
        {quiz !== 'type' && <p><strong>Find it:</strong> then, a few facts in random order: where did you put them?</p>}
        <button className="btn ink wide" onClick={start}>Start the quiz</button>
        <p className="scrawl">right answers make them bounce, misses put them to sleep</p>
      </div>
    );
  }

  const sleeperStatus = (spot) => {
    if (palace.readOnly) return 'walk past it again in Wander';
    if (rewriting[spot.id]) return 'dreaming…';
    return 'new, weirder scene ready';
  };

  if (finished) {
    const happy = path.length - sleepers.length;
    return (
      <div className="float-card quiz-card">
        <span className="chip green">Quiz done</span>
        <h2 className="card-title big">{happy} / {path.length} happy friends</h2>
        {sleepers.length === 0 ? (
          <p className="scrawl">everyone’s bouncing. your palace works!</p>
        ) : (
          <>
            <p>{palace.readOnly
              ? 'These friends fell asleep. Walk past them again in Wander, then quiz again:'
              : 'These friends fell asleep. Each one has dreamed up a weirder scene to wake up to:'}</p>
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

  const { spot, number } = current;
  const place = placeName(spot, number);
  const where = kind === 'where';
  const round = where ? 'Find it' : 'Walk the path';
  const inRound = where && twoRounds ? q - roundTwoStart : q;
  const roundSize = where && twoRounds ? questions.length - roundTwoStart : twoRounds ? roundTwoStart : questions.length;
  const verdict = graded?.correct === null ? 'Close! Did you have it?' : graded?.correct ? 'Nailed it!' : 'Zzz… they fell asleep';

  return (
    <div className="float-card quiz-card">
      <div className="quiz-head">
        <span className="chip green">{twoRounds ? `Round ${where ? 2 : 1} · ` : ''}{round}</span>
        <span className="quiz-count">{inRound + 1} / {roundSize}</span>
      </div>

      {where ? (
        <>
          <h2 className="card-title big">Where did you put this?</h2>
          <div className="sticky"><p>{spot.fact}</p></div>
          {!graded && (
            <>
              <span className="field-label">Tap its friend in the room, or pick a place:</span>
              <div className="choice-row">
                {choices.map((c) => (
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
          <h2 className="card-title big">What fact did you leave at the {place}?</h2>
          {!graded && (
            <>
              {/* The scene is only the key: the answer is the fact itself (graded on its key words). */}
              <p className="hint-text quiz-hint">Picture its scene, then type the fact it stands for, in your own words.</p>
              <label htmlFor="guess" className="field-label">The fact</label>
              <input
                id="guess"
                className="pill-input"
                autoFocus
                autoComplete="off"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && answer.trim() && submit({ answer })}
                placeholder="e.g. what it is or what it does…"
              />
            </>
          )}
        </>
      )}

      {graded && (
        <div className={`sticky ${graded.correct === false ? 'sleepy' : ''}`}>
          <span className="sticky-title">{verdict}</span>
          {where ? (
            <p>{graded.correct ? 'Yes! ' : ''}It lives at {number} · {place}.</p>
          ) : (
            <>
              {answer.trim() && <p className="your-answer">You said: “{answer.trim()}”</p>}
              <span className="sticky-label">The fact</span>
              <p>{spot.fact}</p>
            </>
          )}
        </div>
      )}

      {showPicture && (
        <SpotImage palaceId={palace.id} spot={spot} status={images.status[spot.id]}
          onRetry={() => images.enqueue([spot.id])} className="quiz-photo" />
      )}

      {graded?.correct === null ? (
        <div className="btn-row">
          <button className="btn ghost" onClick={() => overrule(false)}>No, I missed it</button>
          <button className="btn ink" onClick={() => overrule(true)}>Yes, I had it</button>
        </div>
      ) : graded ? (
        <>
          {!where && answer.trim() && !graded.overruled && (
            <div className="overrule">
              <span>{graded.correct ? 'Not quite right?' : 'Actually knew it?'}</span>
              <button className="btn ghost small" onClick={() => overrule(!graded.correct)}>
                {graded.correct ? 'Count it as missed' : 'Count it as right'}
              </button>
            </div>
          )}
          <div className="btn-row">
            <button className="btn ghost" onClick={peek}>{showPicture ? 'Hide the scene' : 'See the scene'}</button>
            <button className="btn ink" onClick={next}>{q < questions.length - 1 ? 'Next →' : 'See results'}</button>
          </div>
        </>
      ) : (
        <>
          <div className="btn-row">
            <button className="btn ghost" onClick={() => submit(where ? { placeId: null } : { answer: '' })}>I forgot</button>
            {!where && <button className="btn ink" disabled={!answer.trim()} onClick={() => submit({ answer })}>Check</button>}
          </div>
          {!where && (
            <button className="btn ghost small peek-btn" onClick={peek}>
              {showPicture ? 'Hide the picture' : 'Stuck? Peek at the picture'}
            </button>
          )}
        </>
      )}

      {graded && showPicture && <p className="scrawl scene-text">{spot.scene}</p>}
    </div>
  );
}
