import { useRef } from 'react'
import { useFileDrop } from '../useFileDrop'

// Photo slot on a quiz card: shows the picture with change/remove, or an add
// button. A photo can also be dropped anywhere on it. Cards have two slots,
// so `label` says which one this is ("Question photo" / "Answer photo").
export default function CardPhoto({ label, url, onPick, onRemove }) {
  const input = useRef(null)
  const choose = e => {
    const file = e.target.files[0]
    e.target.value = ''
    if (file) onPick(file)
  }
  const drop = useFileDrop(files => onPick(files[0]))
  return (
    <div className={`card-photo${drop.over ? ' is-over' : ''}`} {...drop.props}>
      {url && <small className="card-photo-label">{label}</small>}
      {url && <img src={url} alt="" />}
      <div className="row">
        <button type="button" className="btn btn-small btn-ghost" onClick={() => input.current.click()}>{url ? 'Change' : `+ ${label}`}</button>
        {url && <button type="button" className="btn btn-small btn-ghost" onClick={onRemove}>Remove</button>}
        {!url && <small className="muted">or drop one here</small>}
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={choose} />
    </div>
  )
}
