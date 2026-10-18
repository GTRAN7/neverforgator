import { useEffect, useState } from 'react';
import Logo from './Logo.jsx';
import SkyPage from './SkyPage.jsx';
import SettingsMenu from './SettingsMenu.jsx';
import AccountMenu from './AccountMenu.jsx';
import { useAccount } from '../lib/account.js';
import Creature, { Sparkle } from './Creature.jsx';

// The onboarding tour: what a memory palace is and why it works, taught by actually using one.
// The example is real study material (parts of a cell) stored along 5 stops in the Reitz,
// and step 5 makes you recall it, so by the end you've felt the method work.
export const TOUR_DONE_KEY = 'neverforgator-tour-done';

// Step 1's home: hovering a room shows the thing you know is there without ever studying it.
const HOME_STOPS = [
  { icon: '🚪', name: 'front door', find: '🔑', item: 'keys', where: 'on the hook by the door' },
  { icon: '🗄️', name: 'office', find: '📎', item: 'paperclips', where: 'in the cabinet’s top drawer' },
  { icon: '🍳', name: 'kitchen', find: '🍴', item: 'forks', where: 'top right drawer' },
  { icon: '🛏️', name: 'bed', find: '🎧', item: 'headphones', where: 'on the nightstand' },
];

const STOPS = [
  {
    place: 'chess set',
    icon: '♟️',
    term: 'Ribosomes',
    fact: 'They build proteins.',
    hook: 'ribosomes → builders in RIBBONS · proteins → a PROTEIN bar',
    scene: 'Tiny builders in RIBBONS snap the chess pieces into one long chain, then hand you a PROTEIN bar made of it.',
  },
  {
    place: 'TV screen',
    icon: '📺',
    term: 'Nucleus',
    fact: 'The control center of the cell. It holds the DNA.',
    hook: 'nucleus → “NEW CLUES!” on the news · DNA → the twisted-ladder script',
    scene: 'BREAKING NEWS: “NEW CLUES!” The anchor reads orders off a twisting DNA ladder, and every game in the room obeys the TV.',
  },
  {
    place: 'recycling bins',
    icon: '♻️',
    term: 'Lysosomes',
    fact: 'They break down waste and worn-out parts with digestive enzymes.',
    hook: 'lysosomes → LYSOL bins · digestive enzymes → fizzing juice',
    scene: 'The bins are full of LYSOL-like digestive juice: toss in old trash and broken parts, and they fizz away to nothing.',
  },
  {
    place: 'pillar',
    icon: '🏛️',
    term: 'Cell wall',
    fact: 'Plant cells have a stiff wall for support and protection.',
    hook: 'cell wall → the stiff pillar · plant cells → a potted plant hugging it',
    scene: 'A potted PLANT hugs the thick pillar, a stiff WALL of armor holding up the whole room. You knock: rock hard.',
  },
  {
    place: 'theater doors',
    icon: '🚪',
    term: 'Cell membrane',
    fact: 'It controls what enters and leaves the cell.',
    hook: 'membrane → MEMBERS-ONLY doors',
    scene: 'The doors are a MEMBERS-ONLY bouncer: they swing open for water and snacks, then slam shut on a giant pizza.',
  },
];

// Where each stop sits on the little map (percent of the map box).
const MAP_POINTS = [[14, 72], [34, 34], [58, 62], [78, 24], [88, 70]];

const QUIZ = [
  { stop: 4, question: 'Walk to the theater doors. Which part of the cell lives there?' },
  { stop: 1, question: 'Now the TV screen. What’s there?' },
  { stop: 2, question: 'Last stop: the recycling bins?' },
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
          Ask yourself tomorrow what happens at the pillar.</p>
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
        <span className="route-map-label">Your home, from memory...</span>
        <div className="home-route">
          {HOME_STOPS.map(({ icon, name, find, item, where }) => (
            // Hover (or tap) a room: the little thing you just know lives there.
            <div key={name} className="home-stop" tabIndex={0} aria-label={`${name}: ${item}, ${where}`}>
              <span className="home-find" aria-hidden="true">
                <span className="home-find-icon">{find}</span>
                <span><b>{item}</b>{where}</span>
              </span>
              <span className="map-icon big" aria-hidden="true">{icon}</span>
              <span className="tag">{name}</span>
            </div>
          ))}
        </div>
        <p className="scrawl">You never tried to memorize where things are, yet you just know!</p>
        <p className="scrawl home-art-why">(Hover over a room: you already know what's there!)</p>
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
        <p>Let’s learn the <strong>parts of a cell</strong>. NeverForgator cuts your notes into small ideas, each the
          size of one picture, and gives every idea its own stop, in order.</p>
        <p>Too many ideas for your route? It tells you to add a room instead of cramming. Crammed stops blur together.</p>
      </>
    ),
    art: () => (
      <div className="guide-art split-art">
        <div className="notes-card">
          <span className="sticky-label">your notes</span>
          <p>Ribosomes build proteins… Nucleus: control center, holds DNA… Lysosomes digest waste… Plants have a cell wall… Membrane controls what gets in…</p>
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
          makes noise, and turns hard words into pictures (<strong>membrane</strong> → “members only”).</p>
        <p>The best stops already do the job: doors decide who gets in, just like the cell membrane.</p>
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
];

// onStart: start memorizing (copy the built-in Reitz). onSample: open the finished example in 3D.
// Both are missing when logged out; then onSignup is shown instead.
function GuideContent({ onStart, onSample, onSignup, onClose }) {
  const account = useAccount(); // signed in: show your profile, like the other pages
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
        <div className="nav-actions">
        <SettingsMenu />
        {account?.user && <AccountMenu account={account} />}
        <button className="nav-pill" onClick={onClose}>{last ? 'Close' : 'Skip the tour'} <span aria-hidden="true">→</span></button>
        </div>
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
                {onSample && <button className="btn ghost big" disabled={busy} onClick={() => go(onSample)}>Walk the whole cell in 3D</button>}
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

// The page sits in front of campus mode's sky.
export default function Guide(props) {
  return (
    <SkyPage>
      <GuideContent {...props} />
    </SkyPage>
  );
}
