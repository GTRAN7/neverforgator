import { useEffect } from 'react'

// Opened from the logo or Settings (see ../about.js).
export default function AboutDialog({ onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <section className="plaque dialog about" role="dialog" aria-label="About Never Forgator" onClick={e => e.stopPropagation()}>
        <button className="icon-btn plaque-close" onClick={onClose} aria-label="Close">×</button>
        <p className="eyebrow">About</p>
        <h2 className="plaque-q">Welcome, ruler! 📏</h2>
        <p>
          Welcome to Never Forgator, built by students at the University of Florida. We built this to teach
          students to use the <b>method of loci</b> (aka, your mind palace). It's a useful trick for memorization
          or learning new concepts. As an effect, you can also just use this as a way to memorize terms that
          relate to specific locations (e.g. learning parts of the body or architecture in a city)!
        </p>

        <h3>How to use it</h3>
        <ol className="about-steps">
          <li><b>Create a palace</b> from one of our default paths, our sample deck to see how to use the app, a custom route of your own photos, or a blank one.</li>
          <li><b>Fill in each stop:</b> click the sign (or head to Notes) to set the subject, concept, memory image. Pin question cards to spots in the scene with <b>Edit</b>.</li>
          <li><b>Walk</b> the route to see each stop's concept and image in order (this is your memory palace).</li>
          <li><b>Quiz</b> yourself: answer questions on individual stops, the whole quiz, or your starred cards for extra review.</li>
        </ol>

        <h3>Make it yours</h3>
        <p>
          ⚙ Settings has night mode, a dyslexia-friendly font, colorblind-friendly colors, and text size. Inside a
          palace, <b>Advanced appearance</b> changes the sky, signs, pin colors and cursor. Upload your own
          background, cursor, sign, etc. to personalize (and enjoy!) your experience.
        </p>

        <h3>Share</h3>
        <p><b>Export</b> or <b>import</b> your palace to share with other rulers, and learn together!</p>

        <h3>Made at SwampHacks 2026 by</h3>
        <ul className="about-team">
          <li><b>Kira Luna Nichtawitz</b> · UX design</li>
          <li><b>Natasha Antoniuk</b> · Frontend</li>
          <li><b>Eric Tran</b> · Gemini API &amp; middleware</li>
          <li><b>Thomas McLaughlin</b> · Backend</li>
        </ul>

        <div className="row">
          <button className="btn" autoFocus onClick={onClose}>Got it</button>
        </div>
      </section>
    </div>
  )
}
