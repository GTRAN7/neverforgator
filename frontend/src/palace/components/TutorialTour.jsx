import { useEffect, useState } from 'react'

// Each step points at part of the screen (a CSS selector) and explains it.
// Steps without a target show in the middle.
const STEPS = [
  {
    title: 'Welcome to your first memory palace!',
    text: 'A memory palace is a route of places you know. You leave one idea at each place, then walk the route in your mind to remember them. This one has three example stops.',
  },
  {
    target: '.stage .sign',
    title: 'The sign',
    text: 'Each stop has a sign with the place and its subject. Click the sign to rename the stop or change what it is about.',
  },
  {
    target: '.stage .pin',
    title: 'Pins are cards',
    text: 'Each pin is a question card placed on a spot in the photo. Click one to read the question, then reveal the answer.',
  },
  {
    target: '.arrows',
    title: 'Walk the route',
    text: 'Use the arrows (or ← → on your keyboard) to move between stops. Here the route goes Century Tower → Pudong skyline → the brain.',
  },
  {
    target: '[data-tour="notes"]',
    title: 'Notes',
    text: "Write the stop's concept, a vivid memory image and its cards. When you add a card, its pin follows your cursor until you click the photo to place it.",
  },
  {
    target: '[data-tour="edit"]',
    title: 'Edit',
    text: 'In Edit mode, click anywhere on the photo to pin a new card, and drag pins to move them. You can also hide a pin without deleting its card.',
  },
  {
    target: '[data-tour="walk"]',
    title: 'Walk',
    text: "A guided walk shows each stop's concept and memory image in order. This is how you build the palace in your head.",
  },
  {
    target: '[data-tour="quiz"]',
    title: 'Quiz',
    text: 'Test yourself on every stop or just this one. Star tricky cards to review them on their own later.',
  },
  {
    target: '.hamburger',
    title: 'The map',
    text: 'Open the map to jump between stops, reorder them, add new places or your own photos, rename the palace, and export or save it.',
  },
  {
    target: '.settings-btn',
    title: 'Settings',
    text: "Night mode, a dyslexia-friendly font, colorblind-friendly colors and text size. Advanced appearance changes this palace's sky, signs, pins and cursor.",
  },
  {
    title: "That's the tour!",
    text: 'Keep exploring these examples, or make a palace of your own. You can replay this tour any time from the map (☰).',
    last: true,
  },
]

const CARD_WIDTH = 360
const GAP = 14

// Highlights the step's target (dimming everything else) with a card next to it.
export default function TutorialTour({ onDone, onMakeOwn }) {
  const [i, setI] = useState(0)
  const step = STEPS[i]

  // Re-measure the highlighted element whenever the window changes size.
  const [, setResized] = useState(0)
  useEffect(() => {
    const onResize = () => setResized(n => n + 1)
    addEventListener('resize', onResize)
    return () => removeEventListener('resize', onResize)
  }, [])
  const box = step.target && document.querySelector(step.target)?.getBoundingClientRect()
  const rect = box?.width ? box : null

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onDone()
      else if (e.key === 'ArrowRight') setI(n => Math.min(n + 1, STEPS.length - 1))
      else if (e.key === 'ArrowLeft') setI(n => Math.max(n - 1, 0))
      else return
      // Keep the palace's own arrow keys from moving between stops underneath.
      e.stopPropagation()
      e.preventDefault()
    }
    addEventListener('keydown', onKey, true)
    return () => removeEventListener('keydown', onKey, true)
  }, [onDone])

  // Put the card below the target, or above it when the target is low on screen.
  const width = Math.min(CARD_WIDTH, innerWidth - 32)
  let cardStyle = { width }
  if (rect) {
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - width / 2), innerWidth - width - 16)
    cardStyle = rect.top + rect.height / 2 > innerHeight / 2
      ? { width, left, bottom: innerHeight - rect.top + GAP }
      : { width, left, top: rect.top + rect.height + GAP }
  }
  const pad = 6

  return (
    <div className="tour" role="dialog" aria-label="Tutorial" aria-live="polite">
      {rect
        ? <div className="tour-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
        : <div className="tour-dim" />}
      <section className={`plaque tour-card${rect ? '' : ' is-center'}`} style={cardStyle}>
        <p className="eyebrow">Tutorial · {i + 1} of {STEPS.length}</p>
        <h2 className="plaque-q">{step.title}</h2>
        <p>{step.text}</p>
        <div className="row">
          {step.last ? (
            <>
              <button className="btn btn-ghost" onClick={onDone}>Keep exploring</button>
              <button className="btn" autoFocus onClick={onMakeOwn}>Make my own palace</button>
            </>
          ) : (
            <>
              <button className="link tour-skip" onClick={onDone}>Skip tour</button>
              <button className="btn btn-ghost" disabled={i === 0} onClick={() => setI(i - 1)}>Back</button>
              <button className="btn" autoFocus onClick={() => setI(i + 1)}>{i === 0 ? 'Start' : 'Next'}</button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
