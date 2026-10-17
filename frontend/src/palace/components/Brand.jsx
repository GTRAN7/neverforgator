import '@fontsource/fredoka/700.css'
import { Gator } from '../../components/Logo.jsx'
import { openAbout } from '../about'

// The same gator and "NeverForgator" wordmark as the 3D studio's header (components/Logo.jsx),
// on a pill so it reads over any sky, tagged (2D) to tell the modes apart. Clicking it opens About.
export default function Brand() {
  return (
    <button className="brand" onClick={openAbout} title="About Never Forgator">
      <Gator size={36} />
      <span className="brand-word">NeverForgator <span className="brand-tag">(2D)</span></span>
    </button>
  )
}
