import Creature, { Sparkle } from './Creature.jsx';

const STEPS = [
  {
    title: 'Pick a place',
    text: 'Walk a ready-made UF campus route, or snap a panorama of your own room. Every stop along the way can hold one thing to remember.',
  },
  {
    title: 'Feed it your notes',
    text: 'Paste your notes or a topic. Gemini picks the key facts and hatches a little friend at each stop, acting out a weird, vivid scene.',
  },
  {
    title: 'Wander, then quiz',
    text: 'Walk the route and meet each friend. In the quiz they hide their facts: remember one and it bounces; forget one and it dreams up an even weirder scene.',
  },
];

// A little picture of the app: a room with friends on a dotted trail and a polaroid.
function HeroScene() {
  return (
    <div className="hero-scene" aria-hidden="true">
      <div className="bunting">
        {Array.from({ length: 9 }, (_, k) => (
          <span key={k} style={{ borderTopColor: ['#F08A6C', '#7FA98B', '#FFD86B', '#8CCBFF', '#FF9EC4'][k % 5], animationDelay: `${k * 0.2}s` }} />
        ))}
      </div>
      <div className="hero-floor" />
      <svg className="hero-trail" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M12 70 Q 22 44 34 54 T 58 80" fill="none" stroke="#B04A2E" strokeWidth="0.9" strokeDasharray="0.1 3" strokeLinecap="round" />
      </svg>
      <div className="sprite hero-friend" style={{ left: '12%', top: '70%' }}><Creature number={1} state="happy" size="md" /><span className="tag">1</span></div>
      <div className="sprite hero-friend active" style={{ left: '34%', top: '54%', animationDelay: '0.6s' }}><Creature number={2} size="lg" /><span className="tag">you are here</span></div>
      <div className="sprite hero-friend" style={{ left: '58%', top: '80%' }}><Creature number={3} state="egg" size="md" /><span className="tag">?</span></div>
      <div className="polaroid hero-polaroid">
        <div className="tape" />
        <p className="scrawl">A mitochondria in a hard hat flicks the light switch, yelling “ATP! ATP!”</p>
        <div className="sticky">
          <span className="sticky-label">Remember this</span>
          <p>Mitochondria make ATP, the cell’s energy.</p>
        </div>
      </div>
    </div>
  );
}

// The front door: what Mind Palace is, why it works, and log in / sign up.
export default function Landing({ error, onLogin, onSignup }) {
  return (
    <div className="landing">
      <header className="landing-nav">
        <span className="brand-link">
          <Creature color="#F08A6C" size="logo" />
          <span className="wordmark">Mind Palace</span>
        </span>
        <button className="btn ghost small" onClick={onLogin}>Log in</button>
      </header>

      <section className="landing-hero">
        <div className="hero-copy">
          <span className="chip yellow">built for UF students · SwampHacks</span>
          <h1 className="landing-title">Remember anything by taking a walk.</h1>
          <p className="landing-lead">
            Mind Palace turns your notes into little friends that live along a real place you know:
            the Reitz, your dorm, your route to class. Walk it again in your head and the facts come right back.
          </p>
          {error && <p className="error-text">Couldn’t sign in: {error.message}</p>}
          <div className="hero-actions">
            <button className="btn accent big" onClick={onSignup}><Sparkle size={20} /> Build my first palace</button>
            <button className="btn ghost big" onClick={onLogin}>I have an account</button>
          </div>
          <p className="scrawl">free, and your first palace takes about two minutes</p>
        </div>
        <HeroScene />
      </section>

      <section className="landing-section">
        <h2 className="card-title huge">How it works</h2>
        <ol className="steps">
          {STEPS.map((step, i) => (
            <li key={step.title} className="step-card" style={{ '--tilt': `${[-1, 0.8, -0.6][i]}deg` }}>
              <Creature number={i + 1} size="md" />
              <span className="step-number">step {i + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-section why">
        <div className="why-card">
          <h2 className="card-title huge">Why a palace?</h2>
          <p>
            Your memory for <strong>places</strong> is far stronger than your memory for lists. The
            <strong> method of loci</strong> uses that: you “store” each fact at a spot along a route you know, as a
            strange, vivid image. To remember, you just walk the route in your head.
          </p>
          <p>
            It’s been used since ancient Greece, and it’s still the go-to technique of competitive memory athletes.
            The hard part has always been building the palace. Mind Palace does that part for you.
          </p>
        </div>
      </section>

      <footer className="landing-foot">
        <button className="btn accent big" onClick={onSignup}><Sparkle size={20} /> Start remembering</button>
        <span className="scrawl">made with too much coffee at SwampHacks</span>
      </footer>
    </div>
  );
}
