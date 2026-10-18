import { switchMode } from '../../lib/mode.js'

// Back to the 3D studio, in the header next to Settings on every campus-mode screen.
export default function StudioButton() {
  return (
    <button className="studio-btn" onClick={() => switchMode('studio')} title="Back to the NeverForgator 3D studio">
      <span aria-hidden="true">←</span> 3D studio
    </button>
  )
}
