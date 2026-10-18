import '@fontsource/fredoka/700.css'
import { Gator } from '../../components/Logo.jsx'

// The same gator and "NeverForgator" wordmark as the 3D studio's header (components/Logo.jsx),
// on a pill so it reads over any sky, tagged (2D) to tell the modes apart. Clicking it goes home
// (your palaces); About is in Settings.
export default function Brand({ onHome }) {
  const home = onHome ?? (() => window.scrollTo({ top: 0, behavior: 'smooth' })) // already home: back to the top
  return (
    <button className="brand" onClick={home} title="Home">
      <Gator size={36} />
      <span className="brand-word">NeverForgator <span className="brand-tag">(2D)</span></span>
    </button>
  )
}
