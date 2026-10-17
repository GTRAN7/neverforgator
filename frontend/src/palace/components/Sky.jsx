// Shared backdrop behind every location: gradient sky, outlined clouds,
// a few birds and a distant treeline (all static for now). Scenes with transparent
// areas (cutout photos, the drawn placeholders) show it through.

const CLOUDS = [
  { left: 4, top: 8, scale: 1.4 },
  { left: 38, top: 22, scale: 0.9 },
  { left: 58, top: 4, scale: 0.7 },
  { left: 78, top: 30, scale: 1.1 },
  { left: 24, top: 3, scale: 0.6 },
]

const FLOCKS = [
  { left: 30, top: 18, size: 1, birds: [[0, 0], [34, 14], [-30, 18], [64, 30]] },
  { left: 66, top: 34, size: 0.7, birds: [[0, 0], [28, 10], [52, 4]] },
]

function Cloud() {
  return (
    <svg viewBox="-4 -40 210 86" width="210" height="86">
      <path
        d="M0 40 q0-34 40-34 q14-34 58-24 q30-20 58 6 q40-4 40 40 z"
        fill="#fbf6ec"
        stroke="#3b2a1e"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path d="M30 26 q14-10 30-4" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
    </svg>
  )
}

function Bird({ x, y }) {
  return (
    <span className="bird" style={{ left: x, top: y }}>
      <svg viewBox="0 0 40 16" width="40" height="16">
        <path d="M2 10 Q11 0 20 10 Q29 0 38 10" fill="none" stroke="#3b2a1e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

// A little storybook castle on the far hill: your memory palace.
function Castle() {
  const line = { stroke: '#3b2a1e', strokeWidth: 3, strokeLinejoin: 'round', strokeLinecap: 'round' }
  return (
    <svg className="castle" viewBox="0 0 140 120" aria-hidden="true">
      <g {...line}>
        {/* flag */}
        <path d="M70 6 v22" fill="none" />
        <path d="M70 7 l16 5 l-16 5 z" fill="#fa4616" />
        {/* keep */}
        <path d="M44 52 v-10 h8 v6 h8 v-6 h8 v6 h8 v-6 h8 v6 h8 v-6 h8 v10" fill="#efe3cf" />
        <rect x="44" y="52" width="52" height="66" fill="#efe3cf" />
        <path d="M58 118 v-22 a12 12 0 0 1 24 0 v22 z" fill="#7a5233" />
        <rect className="castle-window" x="64" y="62" width="12" height="16" rx="6" fill="#3b4e66" />
        {/* side towers */}
        <rect x="14" y="58" width="30" height="60" fill="#e6d6bd" />
        <rect x="96" y="58" width="30" height="60" fill="#e6d6bd" />
        <path d="M10 60 L29 26 L48 60 Z" fill="#e9763f" />
        <path d="M92 60 L111 26 L130 60 Z" fill="#e9763f" />
        <rect className="castle-window" x="24" y="74" width="10" height="13" rx="5" fill="#3b4e66" />
        <rect className="castle-window" x="106" y="74" width="10" height="13" rx="5" fill="#3b4e66" />
      </g>
      <path d="M33 34 l-6 12 M115 34 l-6 12" stroke="#fff6" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

function Moon() {
  return (
    <svg className="sky-moon" viewBox="0 0 100 100" aria-hidden="true">
      <path d="M66 10 A42 42 0 1 0 90 72 A34 34 0 1 1 66 10 Z" fill="#f4efd9" stroke="#3b2a1e" strokeWidth="4" strokeLinejoin="round" />
      <circle cx="40" cy="58" r="5" fill="#e3dcc0" />
      <circle cx="52" cy="78" r="3.5" fill="#e3dcc0" />
    </svg>
  )
}

const STARS = [[8, 10], [18, 28], [27, 8], [41, 18], [55, 6], [63, 26], [72, 12], [86, 30], [93, 8], [35, 34], [12, 42], [80, 44]]

// `look` comes from the palace's Advanced appearance settings (see appearance.js);
// the landing page and dashboard use the defaults.
// `night` (the app-wide night mode) turns any sky into a moonlit one.
export default function Sky({ look = {}, imageUrl = null, night = false }) {
  const { clouds = true, birds = true, sun = true, hills = true, castle = true } = look
  const photo = look.sky === 'image' && imageUrl
  const sky = night && !photo ? 'night' : (look.sky ?? 'day')
  const dark = sky === 'night'
  return (
    <div
      className={`sky sky-${sky}${night && photo ? ' is-dimmed' : ''}`}
      style={photo ? { backgroundImage: `url(${imageUrl})` } : undefined}
      aria-hidden="true"
    >
      {dark && (
        <div className="sky-stars">
          {STARS.map(([x, y], i) => <span key={i} style={{ left: `${x}%`, top: `${y}%`, opacity: 1 - (i % 4) * 0.18 }} />)}
        </div>
      )}
      {sun && (dark ? <Moon /> : <div className="sky-sun" />)}
      <div className="sky-clouds">
        {clouds && CLOUDS.map((c, i) => (
          <div
            key={i}
            className="cloud"
            style={{ left: `${c.left}%`, top: `${c.top}%`, '--s': c.scale }}
          >
            <Cloud />
          </div>
        ))}
        {birds && FLOCKS.map((f, i) => (
          <div
            key={i}
            className="flock"
            style={{ left: `${f.left}%`, top: `${f.top}%`, '--s': f.size }}
          >
            {f.birds.map(([x, y], j) => <Bird key={j} x={x} y={y} />)}
          </div>
        ))}
      </div>
      {castle && hills && <Castle />}
      {hills && (
        <svg className="sky-ground" viewBox="0 0 1600 300" preserveAspectRatio="none">
          <path d="M0 120 Q200 60 420 100 T860 80 T1300 90 T1600 70 V300 H0 Z" fill="#9cb878" stroke="#3b2a1e" strokeWidth="4" />
          <path d="M0 190 Q160 140 330 170 T700 160 T1100 175 T1600 150 V300 H0 Z" fill="#6f9a4c" stroke="#3b2a1e" strokeWidth="4" />
        </svg>
      )}
    </div>
  )
}
