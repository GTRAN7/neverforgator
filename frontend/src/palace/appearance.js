// Advanced appearance settings, saved per palace as `palace.appearance`.

export const DEFAULT_LOOK = {
  sky: 'day', // 'day' | 'sunset' | 'night' | 'overcast' | 'image'
  skyImageId: null, // IndexedDB id of a custom background photo
  clouds: true,
  birds: true,
  sun: true,
  hills: true,
  castle: true,
  signColor: 'blue',
  signSide: 'left', // 'left' | 'right'
  signSize: 'medium', // 'small' | 'medium' | 'large'
  showSigns: true,
}

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
  return {
    className: `${look.signSide === 'right' ? ' signs-right' : ''}${look.showSigns ? '' : ' signs-hidden'}`,
    style: {
      '--sign-filter': color.filter,
      '--sign-scale': SIGN_SIZES[look.signSize] ?? 1,
      // Orange topic text only reads well on the blue sign.
      '--sign-accent': color.id === 'blue' ? 'var(--orange)' : 'var(--cream)',
    },
  }
}
