import { useRef } from 'react'
import signUrl from '../assets/sign.webp'

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const LABELS = { name: 'Place name', topic: 'Subject' }

// A small copy of the sign where the "Place name" and "Subject" boxes can be
// dragged into place (and resized from their corner). Positions are % of the art.
export default function SignLayoutEditor({ url, ar, layout, lettering, onChange }) {
  const frame = useRef(null)

  const startDrag = (key, mode) => e => {
    e.preventDefault()
    e.stopPropagation()
    const rect = frame.current.getBoundingClientRect()
    const start = { x: e.clientX, y: e.clientY, box: { ...layout[key] } }
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const move = ev => {
      const dx = ((ev.clientX - start.x) / rect.width) * 100
      const dy = ((ev.clientY - start.y) / rect.height) * 100
      const b = start.box
      const next = mode === 'move'
        ? { x: clamp(b.x + dx, 0, 100 - b.w), y: clamp(b.y + dy, 0, 100 - b.h) }
        : { w: clamp(b.w + dx, 12, 100 - b.x), h: clamp(b.h + dy, 8, 100 - b.y) }
      onChange({ ...layout, [key]: { ...layout[key], ...next } })
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  return (
    <div className="sign-editor" ref={frame} style={{ aspectRatio: ar }}>
      <img src={url || signUrl} alt="" draggable={false} />
      {Object.keys(LABELS).filter(key => layout[key].show).map(key => (
        <div
          key={key}
          className={`sign-editor-box is-${key}`}
          style={{ left: `${layout[key].x}%`, top: `${layout[key].y}%`, width: `${layout[key].w}%`, height: `${layout[key].h}%`, color: lettering }}
          onPointerDown={startDrag(key, 'move')}
          title={`Drag to move the ${LABELS[key].toLowerCase()}`}
        >
          {LABELS[key]}
          <span className="sign-editor-resize" onPointerDown={startDrag(key, 'resize')} title="Drag to resize" />
        </div>
      ))}
    </div>
  )
}
