// Illustrated stand-in foreground shown until a real photo is uploaded;
// the shared <Sky> shows through above the hills.
// Drawn in the same flat, outlined storybook style as the Blueprint site.

const INK = '#3b2a1e'
const PALETTES = [
  { far: '#9cb878', near: '#6f9a4c', water: '#6aa7c8', accent: '#e9a64a' },
  { far: '#a9b46e', near: '#7d9a4f', water: '#7fa9bf', accent: '#d8743a' },
  { far: '#8db07a', near: '#5f8f52', water: '#5f9fbf', accent: '#e9a64a' },
  { far: '#a5b07c', near: '#78955a', water: '#7aa0c4', accent: '#e58d4f' },
]

const line = { stroke: INK, strokeWidth: 5, strokeLinejoin: 'round', strokeLinecap: 'round' }

function Tree({ x, y, s = 1, c }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} {...line}>
      <path d="M-6 0 v-60 M6 0 v-60" fill="none" />
      <rect x="-8" y="-70" width="16" height="70" fill="#7a5233" />
      <circle cx="0" cy="-110" r="62" fill={c} />
      <circle cx="-44" cy="-80" r="40" fill={c} />
      <circle cx="44" cy="-82" r="42" fill={c} />
      <path d="M-20 -130 q10 -10 22 -4 M18 -96 q10 -8 18 0" fill="none" stroke="#fff6" strokeWidth={6} />
    </g>
  )
}

const Landmarks = {
  blank: () => null,
  tower: () => (
    <g {...line}>
      <rect x="300" y="250" width="150" height="430" fill="#d9825a" />
      <rect x="290" y="230" width="170" height="30" fill="#efe3cf" />
      <path d="M300 230 L375 80 L450 230 Z" fill="#efe3cf" />
      <circle cx="375" cy="320" r="38" fill="#fbf6ec" />
      <path d="M375 320 v-24 M375 320 h18" />
      {[420, 500, 580].map(y => <rect key={y} x="350" y={y} width="50" height="46" rx="22" fill="#3b4e66" />)}
    </g>
  ),
  library: () => (
    <g {...line}>
      <rect x="140" y="380" width="620" height="300" fill="#c9a07a" />
      <rect x="120" y="360" width="660" height="34" fill="#efe3cf" />
      {[0, 1, 2].map(r => [0, 1, 2, 3, 4, 5].map(c => (
        <rect key={`${r}-${c}`} x={175 + c * 95} y={420 + r * 80} width="60" height="50" fill="#9cc6d9" />
      )))}
      <rect x="400" y="600" width="100" height="80" fill="#3b4e66" />
    </g>
  ),
  hall: () => (
    <g {...line}>
      <rect x="180" y="420" width="540" height="260" fill="#b9614a" />
      <path d="M160 420 L450 300 L740 420 Z" fill="#efe3cf" />
      {[0, 1, 2, 3, 4, 5].map(i => <rect key={i} x={220 + i * 88} y="440" width="34" height="240" fill="#f6efe2" />)}
      <rect x="160" y="660" width="580" height="24" fill="#efe3cf" />
    </g>
  ),
  stadium: p => (
    <g {...line}>
      <path d="M90 690 L150 380 Q470 300 790 380 L850 690 Z" fill="#e3e0d7" />
      <path d="M150 380 Q470 300 790 380" fill="none" />
      {[440, 500, 560, 620].map(y => <path key={y} d={`M${120 + (y - 380) * 0.1} ${y} Q470 ${y - 70} ${820 - (y - 380) * 0.1} ${y}`} fill="none" strokeWidth={3} />)}
      <rect x="260" y="330" width="420" height="44" fill="#2a4fa0" />
      <rect x="350" y="250" width="240" height="70" fill={p.accent} />
      <path d="M430 285 h80" stroke="#fbf6ec" strokeWidth={8} />
    </g>
  ),
  plaza: p => (
    <g {...line}>
      <path d="M380 900 L560 560 L620 560 L900 900 Z" fill="#efe3cf" />
      <Tree x={210} y={640} s={1.3} c={p.near} />
      <Tree x={720} y={610} s={1.1} c={p.far} />
      <rect x="520" y="500" width="140" height="70" fill="#d9825a" />
      <path d="M510 500 h160 l-20 -30 h-120 z" fill="#efe3cf" />
    </g>
  ),
  lake: () => (
    <g {...line}>
      {[[260, 760], [330, 800], [600, 830]].map(([x, y]) => (
        <g key={x}>
          <ellipse cx={x} cy={y} rx="56" ry="20" fill="#7fae5a" />
          <path d={`M${x} ${y} l40 -12`} />
        </g>
      ))}
      {[90, 120, 150].map(x => (
        <g key={x}>
          <path d={`M${x} 860 q6 -120 0 -220`} fill="none" />
          <rect x={x - 8} y="610" width="16" height="50" rx="8" fill="#7a5233" />
        </g>
      ))}
      <path d="M520 700 q30 -40 70 -10 q20 -60 60 -40 l10 30 q-40 30 -80 40 z" fill="#fbf6ec" />
    </g>
  ),
}

export default function Placeholder({ variant = 'plaza', palette = 0 }) {
  const p = PALETTES[palette % PALETTES.length]
  const Landmark = Landmarks[variant] ?? Landmarks.plaza
  return (
    <svg className="scene-img" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path d="M0 560 Q240 440 520 520 T1060 480 T1600 520 V900 H0 Z" fill={p.far} {...line} />
      <path d="M0 640 Q300 560 700 620 T1600 600 V900 H0 Z" fill={p.near} {...line} />
      {variant === 'lake' && (
        <g {...line}>
          <ellipse cx="800" cy="760" rx="760" ry="150" fill={p.water} />
          {[[600, 720], [900, 760], [760, 820], [1100, 720]].map(([x, y]) => (
            <path key={x} d={`M${x} ${y} h90`} stroke="#fbf6ec" strokeWidth={7} />
          ))}
        </g>
      )}
      <Tree x={1450} y={700} s={1.5} c="#55803f" />
      <Tree x={1180} y={640} s={0.9} c="#6c9449" />
      <Landmark {...p} />
    </svg>
  )
}
