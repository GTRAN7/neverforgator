// Advanced appearance settings, saved per palace as `palace.appearance`.

export const DEFAULT_LOOK = {
  sky: 'auto', // 'auto' (day, or night in night mode) | 'day' | 'sunset' | 'night' | 'overcast' | 'image'
  skyPicked: false, // true once a sky is picked by hand
  skyImageId: null, // IndexedDB id of a custom background photo
  clouds: true,
  birds: true,
  sun: true,
  hills: true,
  signColor: 'blue',
  signSide: 'left', // 'left' | 'right'
  signSize: 'medium', // 'small' | 'medium' | 'large'
  showSigns: true,
  quizZoom: true, // zoom in on each card's spot during quizzes
  cursor: 'default', // a CURSORS id, or 'custom' (uses cursorUrl)
  cursorUrl: null, // small PNG data URL made from an uploaded image
  signImageId: null, // IndexedDB id of custom sign artwork (null = the campus sign)
  signAr: 1486 / 1791, // width / height of the sign artwork
  signText: 'light', // 'light' | 'dark' | 'custom' lettering
  signTextColor: '#ffe08a', // used when signText is 'custom'
  signTint: '#d94f8c', // sign color when signColor is 'custom' (picked on the wheel)
  signNameScale: 1, // place-name text size on the sign
  signTopicScale: 1, // subject text size on the sign
  pinColor: null, // card pin color (hex); null = UF orange
  pinColorAll: false, // true = every pin uses pinColor (hides remembered/missed colors)
  signLayout: null, // where the name / subject sit on the sign (null = DEFAULT_SIGN_LAYOUT)
}

// Text boxes on the sign, in % of the artwork. `show: false` hides that line.
export const DEFAULT_SIGN_LAYOUT = {
  name: { x: 13, y: 7, w: 74, h: 37, show: true },
  topic: { x: 13, y: 51, w: 74, h: 32, show: true },
}
export const signLayoutOf = look => ({
  name: { ...DEFAULT_SIGN_LAYOUT.name, ...look.signLayout?.name },
  topic: { ...DEFAULT_SIGN_LAYOUT.topic, ...look.signLayout?.topic },
})

// Cursor presets: small SVGs with their hotspot (the pixel that clicks).
const svgCursor = (svg, x, y) => `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, auto`
const arrow = fill => `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path d='M3 2 L3 25 L9 19.5 L13 29 L17.5 27 L13.5 17.5 L21 17.5 Z' fill='${fill}' stroke='#3b2a1e' stroke-width='2.2' stroke-linejoin='round'/></svg>`
export const CURSORS = [
  { id: 'default', label: 'Normal', css: null },
  { id: 'orange', label: 'Orange', css: svgCursor(arrow('#e97451'), 3, 2) },
  { id: 'blue', label: 'Blue', css: svgCursor(arrow('#3399ff'), 3, 2) },
  {
    id: 'star',
    label: 'Star',
    css: svgCursor("<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path d='M16 2 L20 11.5 L30 12.3 L22.4 18.8 L24.8 28.6 L16 23.3 L7.2 28.6 L9.6 18.8 L2 12.3 L12 11.5 Z' fill='#ffd76a' stroke='#3b2a1e' stroke-width='2' stroke-linejoin='round'/></svg>", 16, 16),
  },
  {
    id: 'flower',
    label: 'Flower',
    css: svgCursor("<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><circle cx='16.0' cy='9.0' r='5.6' fill='#ff8fc0' stroke='#3b2a1e' stroke-width='1.6'/><circle cx='22.7' cy='13.8' r='5.6' fill='#ff8fc0' stroke='#3b2a1e' stroke-width='1.6'/><circle cx='20.1' cy='21.7' r='5.6' fill='#ff8fc0' stroke='#3b2a1e' stroke-width='1.6'/><circle cx='11.9' cy='21.7' r='5.6' fill='#ff8fc0' stroke='#3b2a1e' stroke-width='1.6'/><circle cx='9.3' cy='13.8' r='5.6' fill='#ff8fc0' stroke='#3b2a1e' stroke-width='1.6'/><circle cx='16' cy='16' r='4.2' fill='#ffd76a' stroke='#3b2a1e' stroke-width='1.6'/></svg>", 16, 16),
  },
  {
    id: 'hand',
    label: 'Hand',
    css: svgCursor("<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path d='M10.5 14 V5 a2.75 2.75 0 0 1 5.5 0 V12.5 a2.6 2.6 0 0 1 5 0.6 a2.6 2.6 0 0 1 5 1 V22 q0 8 -8 8 H15 q-5 0 -7.5 -5 L4.4 19.4 a2.4 2.4 0 0 1 3.9 -2.7 L10.5 19 Z' fill='#fff3e0' stroke='#3b2a1e' stroke-width='2' stroke-linejoin='round'/><path d='M16 12.5 V18 M21 13.1 V18.5' stroke='#3b2a1e' stroke-width='1.5' stroke-linecap='round'/></svg>", 13, 2),
  },
  {
    id: 'pencil',
    label: 'Pencil',
    css: svgCursor("<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path d='M24 3 L29 8 L11 26 L4 28 L6 21 Z' fill='#f4a43c' stroke='#3b2a1e' stroke-width='2' stroke-linejoin='round'/><path d='M6 21 L11 26' stroke='#3b2a1e' stroke-width='2'/><path d='M4 28 L5.2 24.2 L7.8 26.8 Z' fill='#3b2a1e'/><path d='M21 6 L26 11' stroke='#3b2a1e' stroke-width='2'/></svg>", 4, 28),
  },
]
const cursorCss = look =>
  look.cursor === 'custom' && look.cursorUrl
    ? `url("${look.cursorUrl}") 4 4, auto`
    : CURSORS.find(c => c.id === look.cursor)?.css ?? null

export function lookOf(palace) {
  const look = { ...DEFAULT_LOOK, ...palace.appearance }
  // Palaces saved before Auto existed stored 'day' without anyone choosing it.
  if (look.sky === 'day' && !look.skyPicked) look.sky = 'auto'
  return look
}

export const SKIES = [
  { id: 'auto', label: 'Auto' },
  { id: 'day', label: 'Day' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'night', label: 'Night' },
  { id: 'overcast', label: 'Overcast' },
  { id: 'image', label: 'My photo' },
]

// The sign art is navy blue; other colors are CSS filters over it.
export const SIGN_COLORS = [
  { id: 'blue', label: 'UF blue', swatch: '#0f4764', filter: 'none' },
  { id: 'orange', label: 'Orange', swatch: '#c2571b', filter: 'hue-rotate(180deg) saturate(1.6) brightness(1.5)' },
  { id: 'green', label: 'Green', swatch: '#2f6b3a', filter: 'hue-rotate(-60deg) saturate(1.1) brightness(1.1)' },
  { id: 'red', label: 'Red', swatch: '#8a2a2a', filter: 'hue-rotate(150deg) saturate(1.4) brightness(1.15)' },
  { id: 'purple', label: 'Purple', swatch: '#4b2d73', filter: 'hue-rotate(70deg) saturate(1.2)' },
  { id: 'charcoal', label: 'Charcoal', swatch: '#3a3a3a', filter: 'grayscale(1) brightness(0.9)' },
]

export const SIGN_SIZES = { small: 0.75, medium: 1, large: 1.3 }

// CSS variables + classes the app root applies.
// "#abc" / "abc" / "#aabbcc" → "#aabbcc", or null if it isn't a hex color.
export function normalizeHex(value) {
  const m = String(value).trim().replace(/^#/, '').match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return null
  const h = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1]
  return `#${h.toLowerCase()}`
}

// Dark or light text, whichever reads better on this background color.
function textOn(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.25 ? '#2a1d12' : '#faf3e8'
}

export function lookStyle(look) {
  const color = SIGN_COLORS.find(c => c.id === look.signColor) ?? SIGN_COLORS[0]
  const cursor = cursorCss(look)
  const customSign = !!look.signImageId
  const lettering = look.signText === 'dark' ? '#1d140c' : look.signText === 'custom' ? look.signTextColor : 'var(--light)'
  const tinted = !customSign && look.signColor === 'custom'
  return {
    className: `${look.signSide === 'right' ? ' signs-right' : ''}${look.showSigns ? '' : ' signs-hidden'}${cursor ? ' has-cursor' : ''}${customSign ? ' custom-sign' : ''}${tinted ? ' sign-tinted' : ''}${look.pinColor ? ' has-pin-color' : ''}${look.pinColor && look.pinColorAll ? ' pins-one-color' : ''}`,
    style: {
      ...(cursor && { '--cursor': cursor }),
      '--sign-ar': look.signAr ?? DEFAULT_LOOK.signAr,
      '--sign-text': lettering,
      '--sign-tint': look.signTint,
      ...(look.pinColor && { '--pin-color': look.pinColor, '--pin-text': textOn(look.pinColor) }),
      '--sign-name-scale': look.signNameScale ?? 1,
      '--sign-topic-scale': look.signTopicScale ?? 1,
      // Sign colors only recolor the built-in campus sign.
      '--sign-filter': customSign ? 'none' : tinted ? 'grayscale(1) brightness(2.3)' : color.filter,
      '--sign-scale': SIGN_SIZES[look.signSize] ?? 1,
      // Orange topic text only reads well on the blue sign.
      // Orange subject text only on the blue sign with default letters; otherwise it matches the letters.
      '--sign-accent': !customSign && !tinted && color.id === 'blue' && look.signText === 'light' ? 'var(--orange)' : lettering,
    },
  }
}
