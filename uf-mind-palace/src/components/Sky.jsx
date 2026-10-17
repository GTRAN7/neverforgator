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

export default function Sky() {
  return (
    <div className="sky" aria-hidden="true">
      <div className="sky-sun" />
      <div className="sky-clouds">
        {CLOUDS.map((c, i) => (
          <div
            key={i}
            className="cloud"
            style={{ left: `${c.left}%`, top: `${c.top}%`, '--s': c.scale }}
          >
            <Cloud />
          </div>
        ))}
        {FLOCKS.map((f, i) => (
          <div
            key={i}
            className="flock"
            style={{ left: `${f.left}%`, top: `${f.top}%`, '--s': f.size }}
          >
            {f.birds.map(([x, y], j) => <Bird key={j} x={x} y={y} />)}
          </div>
        ))}
      </div>
      <svg className="sky-ground" viewBox="0 0 1600 300" preserveAspectRatio="none">
        <path d="M0 120 Q200 60 420 100 T860 80 T1300 90 T1600 70 V300 H0 Z" fill="#9cb878" stroke="#3b2a1e" strokeWidth="4" />
        <path d="M0 190 Q160 140 330 170 T700 160 T1100 175 T1600 150 V300 H0 Z" fill="#6f9a4c" stroke="#3b2a1e" strokeWidth="4" />
      </svg>
    </div>
  )
}
