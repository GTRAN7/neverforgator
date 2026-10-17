// Advanced appearance settings, saved per palace as `palace.appearance`.

export const DEFAULT_LOOK = {
  sky: 'day', // 'day' | 'sunset' | 'night' | 'overcast' | 'image'
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
  signText: 'light', // 'light' | 'dark' lettering
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
    id: 'pencil',
    label: 'Pencil',
    css: svgCursor("<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path d='M24 3 L29 8 L11 26 L4 28 L6 21 Z' fill='#f4a43c' stroke='#3b2a1e' stroke-width='2' stroke-linejoin='round'/><path d='M6 21 L11 26' stroke='#3b2a1e' stroke-width='2'/><path d='M4 28 L5.2 24.2 L7.8 26.8 Z' fill='#3b2a1e'/><path d='M21 6 L26 11' stroke='#3b2a1e' stroke-width='2'/></svg>", 4, 28),
  },
]
const cursorCss = look =>
  look.cursor === 'custom' && look.cursorUrl
    ? `url("${look.cursorUrl}") 4 4, auto`
    : CURSORS.find(c => c.id === look.cursor)?.css ?? null

export const lookOf = palace => ({ ...DEFAULT_LOOK, ...palace.appearance })

export const SKIES = [
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
export function lookStyle(look) {
  const color = SIGN_COLORS.find(c => c.id === look.signColor) ?? SIGN_COLORS[0]
  const cursor = cursorCss(look)
  const customSign = !!look.signImageId
  const lettering = look.signText === 'dark' ? '#1d140c' : 'var(--light)'
  return {
    className: `${look.signSide === 'right' ? ' signs-right' : ''}${look.showSigns ? '' : ' signs-hidden'}${cursor ? ' has-cursor' : ''}${customSign ? ' custom-sign' : ''}`,
    style: {
      ...(cursor && { '--cursor': cursor }),
      '--sign-ar': look.signAr ?? DEFAULT_LOOK.signAr,
      '--sign-text': lettering,
      // Sign colors only recolor the built-in campus sign.
      '--sign-filter': customSign ? 'none' : color.filter,
      '--sign-scale': SIGN_SIZES[look.signSize] ?? 1,
      // Orange topic text only reads well on the blue sign.
      '--sign-accent': customSign ? lettering : color.id === 'blue' ? 'var(--orange)' : 'var(--light)',
    },
  }
}
