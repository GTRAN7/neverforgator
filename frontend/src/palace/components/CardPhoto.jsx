import { useRef } from 'react'

// Photo slot on a quiz card: shows the picture with change/remove, or an add button.
export default function CardPhoto({ url, onPick, onRemove }) {
  const input = useRef(null)
  const choose = e => {
    const file = e.target.files[0]
    e.target.value = ''
    if (file) onPick(file)
  }
  return (
    <div className="card-photo">
      {url && <img src={url} alt="" />}
      <div className="row">
        <button type="button" className="btn btn-small btn-ghost" onClick={() => input.current.click()}>{url ? 'Change photo' : '+ Add photo'}</button>
        {url && <button type="button" className="btn btn-small btn-ghost" onClick={onRemove}>Remove photo</button>}
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={choose} />
    </div>
  )
}
