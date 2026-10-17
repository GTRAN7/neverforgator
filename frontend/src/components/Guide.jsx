import { useEffect, useState } from 'react';
import Logo from './Logo.jsx';
import Creature, { Sparkle } from './Creature.jsx';

// The onboarding tour: what a memory palace is and why it works, taught by actually using one.
// The example is real study material (the phases of mitosis) stored along 5 stops in the Reitz,
// and step 5 makes you recall it, so by the end you've felt the method work.
export const TOUR_DONE_KEY = 'neverforgator-tour-done';

const STOPS = [
  {
    place: 'front doors',
    icon: '🚪',
    term: 'Prophase',
    fact: 'Chromosomes condense into X shapes and the nuclear envelope breaks down.',
    hook: 'PRO-phase → PRO wrestlers',
    scene: 'PRO wrestlers kick the doors in, arms crossed into giant X’s. Glass envelopes shatter.',
  },
  {
    place: 'giant chess board',
    icon: '♟️',
    term: 'Metaphase',
    fact: 'Chromosomes line up across the middle of the cell.',
    hook: 'META → MIDDLE',
    scene: 'Every chess piece shuffles into one line straight down the MIDDLE of the board.',
  },
  {
    place: 'foosball table',
    icon: '⚽',
    term: 'Anaphase',
    fact: 'Sister chromatids are pulled apart to opposite ends.',
    hook: 'ANA → AWAY',
    scene: 'You spin the rods and the twin players rip AWAY from each other, to opposite goals.',
  },
  {
    place: 'TV screen',
    icon: '📺',
    term: 'Telophase',
    fact: 'Two new nuclei form, one at each end.',
    hook: 'TELO → TELE-vision → TWO screens',
    scene: 'The TV cracks into TWO screens, with a brand-new news anchor in each.',
  },
  {
    place: 'vending machine',
    icon: '🥤',
    term: 'Cytokinesis',
    fact: 'The cytoplasm pinches in two, leaving two daughter cells.',
    hook: 'CYTO-KINESIS → psycho-kinesis',
    scene: 'A psychic glares until the machine pinches in half and drops TWO identical sodas.',
  },
];

// Where each stop sits on the little map (percent of the map box).
const MAP_POINTS = [[14, 72], [34, 34], [58, 62], [78, 24], [88, 70]];

const QUIZ = [
  { stop: 2, question: 'Walk to the foosball table. What’s happening there?' },
  { stop: 1, question: 'Now step back to the chess board. Which phase lives there?' },
  { stop: 4, question: 'Last stop on the route: the vending machine?' },
];

function RouteMap({ active = -1, showTerms = false }) {
  return (
    <div className="route-map" aria-label="A map of five stops in the Reitz Union">
      <span className="route-map-label">Reitz Union, ground floor</span>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="route-trail" aria-hidden="true">
        <polyline points={MAP_POINTS.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="#B04A2E"
          strokeWidth="1.2" strokeDasharray="0.1 3.4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {STOPS.map((stop, i) => (
        <div key={stop.place} className={`map-stop ${i === active ? 'on' : ''} ${i % 2 ? 'below' : ''}`}
          style={{ left: `${MAP_POINTS[i][0]}%`, top: `${MAP_POINTS[i][1]}%` }}>
          <span className="map-icon" aria-hidden="true">{stop.icon}</span>
          <Creature number={i + 1} size={i === active ? 'md' : 'sm'} state={showTerms || i === active ? 'awake' : 'egg'} />
          <span className="tag">{i + 1} · {stop.place}{showTerms ? ` · ${stop.term}` : ''}</span>
        </div>
      ))}
    </div>
  );
}

function SceneCard({ stop, number }) {
  return (
    <div className="guide-polaroid">
      <div className="tape" />
      <div className="guide-photo" aria-hidden="true">
        <span className="map-icon huge">{stop.icon}</span>
        <Creature number={number} size="lg" />
        <span className="chip green">Stop {number} · {stop.place}</span>
      </div>
      <p className="scrawl scene-text">{stop.scene}</p>
      <span className="hook">hook: {stop.hook}</span>
      <div className="sticky">
        <span className="sticky-label">{stop.term}</span>
        <p>{stop.fact}</p>
      </div>
    </div>
  );
}

function SceneStep() {
  const [i, setI] = useState(0);
  return (
    <div className="guide-scenes">
      <SceneCard stop={STOPS[i]} number={i + 1} />
      <div className="btn-row">
        <button className="btn ghost" disabled={i === 0} onClick={() => setI(i - 1)}>← Previous stop</button>
        <button className="btn ink" disabled={i === STOPS.length - 1} onClick={() => setI(i + 1)}>Walk to the next stop →</button>
      </div>
      <div className="guide-dots small">{STOPS.map((s, k) => <span key={s.term} className={k === i ? 'on' : ''} />)}</div>
    </div>
  );
}

function QuizStep() {
  const [q, setQ] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const done = q >= QUIZ.length;
  if (done) {
    return (
      <div className="guide-quiz">
        <Creature number={3} state="happy" size="lg" />
        <h3 className="card-title big">{score} / {QUIZ.length} from memory</h3>
        <p>You saw each scene once, a minute ago, and you could still walk back and find it. That’s the whole trick.
          Ask yourself tomorrow what happens at the TV screen.</p>
      </div>
    );
  }
  const { stop, question } = QUIZ[q];
  const right = STOPS[stop];
  const choose = (term) => {
    if (picked) return;
    setPicked(term);
    if (term === right.term) setScore((s) => s + 1);
  };
  return (
    <div className="guide-quiz">
      <RouteMap active={stop} />
      <h3 className="card-title">{question}</h3>
      <div className="choice-row">
        {STOPS.map((s) => (
          <button key={s.term} onClick={() => choose(s.term)}
            className={`style-btn ${picked && s.term === right.term ? 'right' : ''} ${picked === s.term && s.term !== right.term ? 'wrong' : ''}`}>
            {s.term}
          </button>
        ))}
      </div>
      {picked && (
        <div className={`sticky ${picked === right.term ? '' : 'sleepy'}`}>
          <span className="sticky-title">{picked === right.term ? 'Yes!' : `It was ${right.term}`}</span>
          <p>{right.hook}: {right.scene}</p>
        </div>
      )}
      {picked && <button className="btn ink" onClick={() => { setQ(q + 1); setPicked(null); }}>Next</button>}
    </div>
  );
}

const STEPS = [
  {
    title: 'Your brain never forgets a place',
    body: (
      <>
        <p>You can walk through your home in your head right now, room by room, without ever having studied it.
          Memory for <strong>places</strong> is one of the strongest kinds of memory we have.</p>
        <p>The <strong>memory palace</strong> (method of loci) borrows that power: you put each thing to learn at a
          spot along a route you know, as a weird little scene. To remember, you walk the route again. Memory
          champions have used it for 2,500 years, and studies show beginners remember far more after a few weeks.</p>
      </>
    ),
    art: () => (
      <div className="guide-art home-art">
        <span className="route-map-label">your home, from memory</span>
        <div className="home-route">
          {[['🚪', 'front door'], ['🛋️', 'couch'], ['🍳', 'kitchen'], ['🛏️', 'bed']].map(([icon, name], i) => (
            <div key={name} className="home-stop">
              <span className="map-icon big" aria-hidden="true">{icon}</span>
              <span className="tag">{name}</span>
              {i === 1 && <span className="thought">the keys! on the couch!</span>}
            </div>
          ))}
        </div>
        <p className="scrawl">you never studied this map, yet you know it cold</p>
      </div>
    ),
  },
  {
    title: 'Step 1 · Pick a route you know',
    body: (
      <>
        <p>We’ll use the <strong>Reitz Union</strong>. It’s built into NeverForgator, with stops already placed, so you
          can start without taking a single photo. Later you can add your dorm, your apartment or your walk to class.</p>
        <p>A good route has distinct stops, in a fixed order, that you can picture instantly.</p>
      </>
    ),
    art: () => <RouteMap />,
  },
  {
    title: 'Step 2 · One idea per stop',
    body: (
      <>
        <p>Let’s learn the <strong>phases of mitosis</strong>, a classic exam question. NeverForgator cuts your notes into
          small ideas, each the size of one picture, and gives every idea its own stop.</p>
        <p>Too many ideas for your route? It tells you to add a room instead of cramming. Crammed stops blur together.</p>
      </>
    ),
    art: () => (
      <div className="guide-art split-art">
        <div className="notes-card">
          <span className="sticky-label">your notes</span>
          <p>Mitosis: prophase, chromosomes condense… metaphase, line up in the middle… anaphase… telophase… cytokinesis…</p>
        </div>
        <span className="split-arrow">→</span>
        <ol className="idea-stack">
          {STOPS.map((s, i) => <li key={s.term}><Creature number={i + 1} /> <span><strong>{s.term}</strong> at the {s.place}</span></li>)}
        </ol>
      </div>
    ),
  },
  {
    title: 'Step 3 · Make every stop weird',
    body: (
      <>
        <p>Your brain ignores the normal and remembers the bizarre. Each scene happens <strong>at the object</strong>, moves,
          makes noise, and turns hard words into a sound-alike <strong>hook</strong> (meta → middle).</p>
        <p>Read each scene once and picture it. Really picture it.</p>
      </>
    ),
    art: () => <SceneStep />,
  },
  {
    title: 'Step 4 · Now walk it from memory',
    body: (
      <>
        <p>Recalling right away is what locks it in. Don’t scroll back up. Walk to the stop in your head and see what’s there.</p>
      </>
    ),
    art: () => <QuizStep />,
  },
  {
    title: 'Step 5 · Walk it again, a little later',
    body: (
      <>
        <p>Memories fade on a curve; each review flattens it. NeverForgator schedules your next walk:
          <strong> tomorrow, then 3, 7 and 21 days</strong>, a bit longer each time you ace the quiz.
          Friends you forget dream up an even weirder scene.</p>
      </>
    ),
    art: () => (
      <div className="guide-art timeline">
        {['today', '+1 day', '+3 days', '+7 days', '+21 days'].map((label, i) => (
          <div key={label} className="timeline-stop">
            <Creature number={i + 1} state={i < 2 ? 'happy' : 'awake'} size="sm" />
            <span>{label}</span>
          </div>
        ))}
      </div>
    ),
  },
];

// onStart: start memorizing (copy the built-in Reitz). onSample: open the finished example in 3D.
// Both are missing when logged out; then onSignup is shown instead.
export default function Guide({ onStart, onSample, onSignup, onClose }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const last = step === STEPS.length;

  async function go(action) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  useEffect(() => {
    try { localStorage.setItem(TOUR_DONE_KEY, '1'); } catch { /* private mode: the tour just shows again */ }
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'BUTTON') return;
      if (e.key === 'ArrowRight') setStep((s) => Math.min(STEPS.length, s + 1));
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const current = STEPS[step];
  return (
    <div className="guide">
      <header className="guide-nav">
        <Logo />
        <button className="nav-pill" onClick={onClose}>{last ? 'Close' : 'Skip the tour'} <span aria-hidden="true">→</span></button>
      </header>

      <div className="guide-dots" role="tablist" aria-label="Tour steps">
        {[...STEPS, null].map((s, i) => (
          <button key={i} role="tab" aria-selected={i === step} aria-label={s?.title ?? 'Start'}
            className={i === step ? 'on' : i < step ? 'done' : ''} onClick={() => setStep(i)} />
        ))}
      </div>

      {last ? (
        <section className="guide-step final">
          <div className="hero-friends" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((n) => <Creature key={n} number={n} state="happy" size="md" />)}
          </div>
          <h1 className="landing-title">That’s it. Now do it with your notes.</h1>
          <p className="landing-lead">Paste a chapter, snap a photo of your notes or just talk. NeverForgator builds the
            palace in the Reitz in about half a minute.</p>
          <div className="hero-actions">
            {onStart ? (
              <>
                <button className="btn accent big" disabled={busy} onClick={() => go(onStart)}>
                  <Sparkle size={20} /> {busy ? 'Setting up…' : 'Start memorizing in the Reitz'}
                </button>
                {onSample && <button className="btn ghost big" disabled={busy} onClick={() => go(onSample)}>Walk the mitosis example in 3D</button>}
              </>
            ) : (
              <button className="btn accent big" onClick={onSignup}><Sparkle size={20} /> Make my free account</button>
            )}
          </div>
          {error && <p className="error-text">{error}</p>}
        </section>
      ) : (
        <section className="guide-step" key={step}>
          <div className="guide-copy">
            <h1 className="card-title huge">{current.title}</h1>
            {current.body}
            <div className="btn-row">
              <button className="btn ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
              <button className="btn accent" onClick={() => setStep(step + 1)}>{step === STEPS.length - 1 ? 'Finish' : 'Next'}</button>
            </div>
          </div>
          <div className="guide-visual">{current.art()}</div>
        </section>
      )}
    </div>
  );
}
