export const uid = () => Math.random().toString(36).slice(2, 10)

const card = (x, y, topic, question, answer) => ({
  id: uid(), x, y, topic, question, answer, stats: { right: 0, wrong: 0 },
})

const loc = (name, subject, variant, palette, pins, notes = '', image = {}) => ({
  id: uid(), name, subject, variant, palette, notes,
  imageId: null, builtin: null, cutout: false, ar: 16 / 9, pins, ...image,
})

export function newLocation(n) {
  return loc('New Spot', 'Subject', ['plaza', 'hall', 'lake'][n % 3], n % 4, [])
}

export function seedPalace() {
  return {
    version: 1,
    builtinsAdded: ['stadium', 'smathers', 'heavener'],
    locations: [
      loc('Ben Hill Griffin Stadium', 'Statistics', 'stadium', 0, [
        card(66, 82, 'Distributions', 'What % of data lies within 2 standard deviations in a normal distribution?', 'About 95% (68% within 1 SD, 99.7% within 3).'),
        card(45, 62, 'Sampling', 'Why does a bigger sample give a better estimate?', 'Standard error shrinks with √n, so the sample mean varies less around the true mean.'),
        card(34, 36, 'Inference', 'What does a p-value of 0.03 mean?', 'If the null hypothesis were true, results at least this extreme would happen 3% of the time.'),
      ], 'The Swamp holds ~88,500 fans — picture every seat as one data point.', { builtin: 'stadium', cutout: true, ar: 2000 / 1270 }),
      ...builtinLocations(),
      loc('Century Tower', 'US History', 'tower', 0, [
        card(23, 50, 'Reconstruction', 'What did the 14th Amendment guarantee?', 'Citizenship to all persons born or naturalized in the US, plus due process and equal protection of the laws.'),
        card(24, 72, 'Civil War', 'In what year was the Emancipation Proclamation issued?', '1863 (announced Sept 1862, effective Jan 1, 1863).'),
      ], 'The bells = "ringing in" new amendments.'),
      loc('Marston Science Library', 'Cell Biology', 'library', 1, [
        card(22, 62, 'Organelles', 'Which organelle produces most of the cell\'s ATP?', 'The mitochondrion, via oxidative phosphorylation.'),
        card(40, 74, 'Membranes', 'What does the fluid mosaic model describe?', 'The plasma membrane as a fluid phospholipid bilayer with embedded, mobile proteins.'),
      ]),
      loc('Lake Alice', 'Ecology', 'lake', 2, [
        card(38, 72, 'Food webs', 'What is a keystone species?', 'A species whose impact on its ecosystem is disproportionately large relative to its abundance.'),
      ]),
      loc('Plaza of the Americas', 'Spanish Vocab', 'plaza', 3, [
        card(30, 60, 'Verbs', 'Translate: "to remember"', 'recordar'),
      ]),
      loc('Turlington Hall', 'Economics', 'hall', 1, [
        card(30, 62, 'Micro', 'What is opportunity cost?', 'The value of the next-best alternative you give up when making a choice.'),
      ]),
    ],
  }
}

// Locations that ship with a real photo. New ones are slotted into palaces
// saved before they existed (see addNewBuiltins), right after the stadium.
function builtinLocations() {
  return [
    loc('Smathers Library', 'Literature', 'hall', 1, [
      card(65, 74, 'Poetry', 'What is iambic pentameter?', 'A line of five iambs — five unstressed/stressed syllable pairs (da-DUM ×5).'),
      card(64, 26, 'Shakespeare', 'Which Shakespeare play opens with "Who\'s there?"', 'Hamlet.'),
      card(86, 50, 'Literary devices', 'What is dramatic irony?', 'When the audience knows something the characters do not.'),
    ], 'Old stone library: the stained windows hold the classics.', { builtin: 'smathers', cutout: true, ar: 2000 / 1270 }),
    loc('Heavener Hall', 'Accounting', 'hall', 3, [
      card(47, 79, 'Basics', 'State the accounting equation.', 'Assets = Liabilities + Equity.'),
      card(52, 30, 'Statements', 'Which statement shows a company\'s position at one point in time?', 'The balance sheet.'),
      card(90, 58, 'Ratios', 'How is the current ratio calculated?', 'Current assets ÷ current liabilities.'),
    ], 'Business school: every window is a line on the balance sheet.', { builtin: 'heavener', cutout: true, ar: 2000 / 1090 }),
  ]
}

export function addNewBuiltins(palace) {
  const known = new Set(palace.builtinsAdded ?? palace.locations.map(l => l.builtin).filter(Boolean))
  const fresh = builtinLocations().filter(l => !known.has(l.builtin))
  if (!fresh.length && palace.builtinsAdded) return palace
  const locations = [...palace.locations]
  const at = locations.findIndex(l => l.builtin === 'stadium') + 1
  locations.splice(at, 0, ...fresh)
  return { ...palace, locations, builtinsAdded: ['stadium', ...builtinLocations().map(l => l.builtin)] }
}
