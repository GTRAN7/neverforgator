// Sample palace data, shaped like the planned API model (see the root README):
// each location is a stop on the route (`palace_stops`): one `concept` plus a
// vivid `association` image that ties it to the place. `pins` are extra quiz
// cards (`quiz_questions`) pinned to spots in that stop's photo.

export const uid = () => Math.random().toString(36).slice(2, 10)

const card = (x, y, topic, question, answer) => ({
  id: uid(), x, y, topic, question, answer, stats: { right: 0, wrong: 0 },
})

const loc = (name, subject, variant, palette, stop, pins, image = {}) => ({
  id: uid(), name, subject, variant, palette,
  concept: stop.concept, association: stop.association, stats: { right: 0, wrong: 0 },
  imageId: null, builtin: null, cutout: false, ar: 16 / 9, pins, ...image,
})

// A location you add yourself: plain hills (no UF landmark) until you add a photo.
export function newLocation({ name, description = '', subject = '' }, n = 0) {
  return { ...loc(name, subject, 'blank', n % 4, { concept: '', association: '' }, []), description }
}

const CENTURY_TOWER_PHOTO = { builtin: 'century', cutout: true, ar: 2000 / 1390 }

export function seedPalace() {
  return {
    version: 2,
    title: 'Sample UF route',
    template: 'sample',
    builtinsAdded: ['stadium', 'smathers', 'heavener'],
    locations: [
      loc('Ben Hill Griffin Stadium', 'Statistics', 'stadium', 0, {
        concept: 'Normal distribution',
        association: '88,000 fans pack the Swamp in a bell curve: a huge crowd at the 50-yard line, thinning out toward both end zones.',
      }, [
        card(66, 82, 'Distributions', 'What % of data lies within 2 standard deviations in a normal distribution?', 'About 95% (68% within 1 SD, 99.7% within 3).'),
        card(45, 62, 'Sampling', 'Why does a bigger sample give a better estimate?', 'Standard error shrinks with √n, so the sample mean varies less around the true mean.'),
        card(34, 36, 'Inference', 'What does a p-value of 0.03 mean?', 'If the null hypothesis were true, results at least this extreme would happen 3% of the time.'),
      ], { builtin: 'stadium', cutout: true, ar: 2000 / 1270 }),
      ...builtinLocations(),
      loc('Century Tower', 'US History', 'tower', 0, {
        concept: '14th Amendment',
        association: 'The bells ring 14 times for everyone born here, and every chime is exactly as loud as the last: equal protection.',
      }, [
        card(80, 30, 'Reconstruction', 'What did the 14th Amendment guarantee?', 'Citizenship to all persons born or naturalized in the US, plus due process and equal protection of the laws.'),
        card(79, 72, 'Civil War', 'In what year was the Emancipation Proclamation issued?', '1863 (announced Sept 1862, effective Jan 1, 1863).'),
      ], CENTURY_TOWER_PHOTO),
      loc('Malachowsky Hall', 'Computer Science', 'hall', 2, {
        concept: 'Binary search',
        association: 'Hunting for a room in Malachowsky, you always take the middle stairwell and rule out half the building each time.',
      }, [
        card(40, 60, 'Algorithms', 'What is the time complexity of binary search?', 'O(log n): each step halves the remaining range.'),
        card(75, 82, 'Data structures', 'What does a hash table give you on average for lookups?', 'O(1) average-time lookup by key.'),
      ], { builtin: 'malachowsky', cutout: true, ar: 2000 / 1390 }),
    ],
  }
}

// Every UF place you can add to a palace, with no notes yet. New campus photos go here.
export const campusCatalog = () => clearStops(seedPalace().locations)

// A fresh palace on the UF route: starts with the first two campus stops; you
// choose the next ones from the catalog as you go.
export function blankRoutePalace(title) {
  return {
    ...seedPalace(),
    title,
    template: 'route',
    locations: campusCatalog().slice(0, 2),
  }
}

// Clear every note, term and card but keep the stops and their photos.
const clearStops = locations => locations.map(l => ({
  ...l, subject: '', concept: '', association: '', definition: '', description: '', pins: [], stats: { right: 0, wrong: 0 },
}))

// Put a palace back the way it started: the sample, the blank UF route, or a
// custom route's own photos with nothing written on them.
export function resetPalace(palace) {
  const { title } = palace
  if (palace.template === 'route') return blankRoutePalace(title)
  if (palace.template === 'blank') return blankPalace(title)
  if (palace.template === 'tutorial') return tutorialPalace()
  if (palace.template === 'custom') return { ...palace, locations: clearStops(palace.locations) }
  return { ...seedPalace(), title }
}

// A blank palace: one empty stop to rename and give a photo; add more as you go.
export function blankPalace(title) {
  return {
    version: 2,
    title,
    template: 'blank',
    builtinsAdded: ['stadium', 'smathers', 'heavener'],
    locations: [newLocation({ name: 'First stop', description: 'Click the sign to rename me, and add a photo' }, 0)],
  }
}

// The new-user tutorial. Placeholder until its example photos and steps are added.
export function tutorialPalace() {
  return {
    ...blankPalace('Tutorial'),
    template: 'tutorial',
    locations: [newLocation({ name: 'Example stop', description: 'The tutorial example is coming soon' }, 0)],
  }
}

// A palace built from your own photos: one stop per photo, in order.
export function customPalace(title, stops) {
  return {
    version: 2,
    title,
    template: 'custom',
    builtinsAdded: ['stadium', 'smathers', 'heavener'],
    locations: stops.map((stop, i) => ({ ...newLocation({ name: stop.name }, i), ...stop.image })),
  }
}

// Locations that ship with a real photo. New ones are slotted into palaces
// saved before they existed, right after the stadium.
function builtinLocations() {
  return [
    loc('Smathers Library', 'Literature', 'hall', 1, {
      concept: 'Iambic pentameter',
      association: 'Your footsteps echo through the stone arch in fives: da-DUM, da-DUM, da-DUM, da-DUM, da-DUM.',
    }, [
      card(65, 74, 'Poetry', 'What is iambic pentameter?', 'A line of five iambs — five unstressed/stressed syllable pairs (da-DUM ×5).'),
      card(64, 26, 'Shakespeare', 'Which Shakespeare play opens with "Who\'s there?"', 'Hamlet.'),
      card(86, 50, 'Literary devices', 'What is dramatic irony?', 'When the audience knows something the characters do not.'),
    ], { builtin: 'smathers', cutout: true, ar: 2000 / 1270 }),
    loc('Heavener Hall', 'Accounting', 'hall', 3, {
      concept: 'Accounting equation',
      association: 'The two wings balance on the front door: assets on the left, liabilities + equity on the right.',
    }, [
      card(47, 79, 'Basics', 'State the accounting equation.', 'Assets = Liabilities + Equity.'),
      card(52, 30, 'Statements', 'Which statement shows a company\'s position at one point in time?', 'The balance sheet.'),
      card(90, 58, 'Ratios', 'How is the current ratio calculated?', 'Current assets ÷ current liabilities.'),
    ], { builtin: 'heavener', cutout: true, ar: 2000 / 1090 }),
  ]
}

// Bring a palace saved by an older version up to date: add new built-in
// locations and fill in stop fields (concept / association / stats).
export function upgradePalace(palace) {
  const known = new Set(palace.builtinsAdded ?? palace.locations.map(l => l.builtin).filter(Boolean))
  const locations = [...palace.locations]
  const fresh = builtinLocations().filter(l => !known.has(l.builtin))
  locations.splice(locations.findIndex(l => l.builtin === 'stadium') + 1, 0, ...fresh)

  const samples = Object.fromEntries(seedPalace().locations.map(l => [l.name, l]))
  return {
    ...palace,
    version: 2,
    builtinsAdded: ['stadium', ...builtinLocations().map(l => l.builtin)],
    locations: locations.map(({ notes, ...l }) => ({
      description: '',
      definition: '',
      concept: samples[l.name]?.concept ?? '',
      association: samples[l.name]?.association ?? notes ?? '',
      stats: { right: 0, wrong: 0 },
      ...l,
      // Century Tower used to be a drawing; give it the photo unless you added your own.
      ...(l.name === 'Century Tower' && !l.imageId && !l.builtin && CENTURY_TOWER_PHOTO),
    })),
  }
}
