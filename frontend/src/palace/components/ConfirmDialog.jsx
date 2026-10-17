import { useEffect, useState } from 'react'

// In-app confirmation (browser confirm() popups can be blocked in embedded views).
// `countdown` keeps the red button disabled for that many seconds.
export default function ConfirmDialog({ title, message, confirmLabel, countdown = 0, onConfirm, onCancel }) {
  const [left, setLeft] = useState(countdown)

  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [left])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onCancel() }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <section className="plaque dialog confirm" role="alertdialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <p className="eyebrow">{title}</p>
        <h2 className="plaque-q">{message}</h2>
        <div className="row">
          <button className="btn btn-ghost" autoFocus onClick={onCancel}>Exit</button>
          <button className="btn btn-danger" disabled={left > 0} onClick={onConfirm}>
            {left > 0 ? `${confirmLabel} (${left})` : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
