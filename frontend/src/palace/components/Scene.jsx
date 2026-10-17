import { useRef } from 'react'
import Placeholder from './Placeholder'
import Sign from './Sign'

const stop = e => e.stopPropagation()
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

function SceneImage({ loc, url }) {
  return url
    ? <img className="scene-img" src={url} alt="" draggable={false} />
    : <Placeholder variant={loc.variant} palette={loc.palette} />
}

function mastery(stats) {
  const total = stats.right + stats.wrong
  if (!total) return 'new'
  return stats.right / total >= 0.7 ? 'good' : 'shaky'
}

// Pointer drag that falls back to a click when the pointer barely moves.
function useDraggable(canvasRef, { enabled, onMove, onClick }) {
  return e => {
    e.stopPropagation()
    if (!enabled) return onClick?.()
    const start = { x: e.clientX, y: e.clientY }
    let moved = false
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const move = ev => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return
      moved = true
      const r = canvasRef.current.getBoundingClientRect()
      onMove(clamp(((ev.clientX - r.left) / r.width) * 100, 2, 98), clamp(((ev.clientY - r.top) / r.height) * 100, 2, 98))
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      if (!moved) onClick?.()
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }
}

function Pin({ pin, n, canvasRef, editing, active, highlight, onSelect, onMove }) {
  const onPointerDown = useDraggable(canvasRef, {
    enabled: editing,
    onMove: (x, y) => onMove(pin.id, x, y),
    onClick: () => onSelect(pin.id),
  })
  return (
    <button
      className={`pin pin-${mastery(pin.stats)}${pin.starred ? ' is-starred' : ''}${active ? ' is-active' : ''}${highlight ? ' is-highlight' : ''}`}
      style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
      onPointerDown={onPointerDown}
      onClick={stop}
      aria-label={`Card ${n}: ${pin.topic || pin.question || 'untitled'}`}
    >
      <span className="pin-num">{n}</span>
      {pin.topic && <span className="pin-label">{pin.topic}</span>}
    </button>
  )
}

export default function Scene({
  loc, url, interactive, editing, quizzing, hideHint,
  activePinId, highlightPinId, onAddPin, onSelectPin, onMovePin, onUpload, onEditStop, signArt,
}) {
  const canvasRef = useRef(null)

  const onCanvasClick = e => {
    if (!editing || !interactive) return
    const r = canvasRef.current.getBoundingClientRect()
    onAddPin(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100)
  }

  return (
    <div className={`scene${interactive ? '' : ' is-passive'}${editing ? ' is-editing' : ''}`}>
      <div className={`scene-canvas${loc.cutout ? ' is-cutout' : ''}`} ref={canvasRef} style={{ '--ar': loc.ar }} onClick={onCanvasClick}>
        <SceneImage loc={loc} url={url} />


        {loc.pins.map((pin, i) => (
          <Pin
            key={pin.id}
            pin={pin}
            n={i + 1}
            canvasRef={canvasRef}
            editing={editing}
            active={pin.id === activePinId}
            highlight={pin.id === highlightPinId}
            onSelect={quizzing ? () => {} : onSelectPin}
            onMove={onMovePin}
          />
        ))}
      </div>

      <Sign loc={loc} art={signArt} onEdit={interactive && !quizzing ? onEditStop : undefined} />

      {!url && interactive && !quizzing && !hideHint && (
        <button className="upload-hint" onClick={onUpload}>
          <strong>Upload a photo of {loc.name}</strong>
          <span>or drop an image anywhere</span>
        </button>
      )}
    </div>
  )
}
