import { useEffect, useState } from 'react'
import { blankPalace, blankRoutePalace, customPalace, seedPalace, uid } from '../seed'
import { createPalace, deletePalace, listPalaces, prepareImage, putImage } from '../storage'
import Sky from './Sky'
import ConfirmDialog from './ConfirmDialog'
import Settings from './Settings'
import { openAbout } from '../about'
import { useFileDrop } from '../useFileDrop'

const TEMPLATES = [
  { id: 'route', title: 'UF campus route', text: 'The campus stops, ready for your own topics, terms and cards.' },
  { id: 'sample', title: 'Sample palace', text: 'The same route already filled in, to see how it works.' },
  { id: 'custom', title: 'Custom route', text: 'Upload your own photos. Each one becomes a stop, in order.' },
  { id: 'blank', title: 'Blank palace', text: 'Start empty and add your own stops and photos as you go.' },
]

// "IMG_cafe-corner.png" → "Img Cafe Corner"
const nameFromFile = file =>
  file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase()) || 'New stop'

const ago = ms => {
  const min = Math.round((Date.now() - ms) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  return new Date(ms).toLocaleDateString()
}

// First page after signing in: create a palace, or reopen one you made before.
// Brand-new users only see the create card.
export default function Dashboard({ account, onOpen, prefs }) {
  const sub = account.user?.sub
  const [palaces, setPalaces] = useState(() => listPalaces(sub))
  const [title, setTitle] = useState('')
  const [template, setTemplate] = useState('route')
  const [photos, setPhotos] = useState([]) // custom route: { id, file, url, name }
  const [busy, setBusy] = useState(false)
  const [doomed, setDoomed] = useState(null) // palace waiting for delete confirmation

  const addPhotos = fileList => {
    // Copy now: the input is cleared right after, which empties its live FileList.
    const added = [...fileList].filter(f => f.type.startsWith('image/'))
      .map(file => ({ id: uid(), file, url: URL.createObjectURL(file), name: nameFromFile(file) }))
    setPhotos(ps => [...ps, ...added])
  }
  const drop = useFileDrop(addPhotos, { multiple: true })
  const removePhoto = id => setPhotos(ps => {
    const gone = ps.find(p => p.id === id)
    if (gone) URL.revokeObjectURL(gone.url)
    return ps.filter(p => p.id !== id)
  })
  const movePhoto = (i, d) => setPhotos(ps => {
    const next = [...ps]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    return next
  })

  // Another tab may create or delete palaces; keep the list current.
  useEffect(() => {
    const refresh = () => setPalaces(listPalaces(sub))
    addEventListener('storage', refresh)
    return () => removeEventListener('storage', refresh)
  }, [sub])

  const create = async e => {
    e.preventDefault()
    const name = title.trim() || ({ sample: 'Sample palace', custom: 'My route', blank: 'Blank palace' }[template] ?? 'New palace')
    if (template !== 'custom') {
      const make = { sample: () => ({ ...seedPalace(), title: name }), route: () => blankRoutePalace(name), blank: () => blankPalace(name) }
      return onOpen(createPalace(sub, make[template]()))
    }
    setBusy(true)
    try {
      // Store each photo (downscaled) and make it a stop; transparent PNGs become cutouts.
      const stops = []
      for (const p of photos) {
        const { blob, ar, cutout } = await prepareImage(p.file)
        const imageId = uid()
        await putImage(imageId, blob)
        stops.push({ name: p.name.trim() || 'New stop', image: { imageId, ar, cutout, builtin: null } })
      }
      onOpen(createPalace(sub, customPalace(name, stops)))
    } catch {
      alert('One of the photos could not be read. Try JPG or PNG (iPhone HEIC photos may need converting).')
      setBusy(false)
    }
  }

  const remove = p => {
    deletePalace(sub, p.id)
    setPalaces(listPalaces(sub))
    setDoomed(null)
  }

  return (
    <main className="landing dashboard">
      <Sky night={prefs.night} />
      <div className="dashboard-content">
        <header className="dashboard-head">
          <button className="brand" onClick={openAbout} title="About UF Memory Palace">UF<span>·</span>MP</button>
          <div className="row">
            <Settings prefs={prefs} />
            {account.user ? (
              <>
                {account.user.picture && <img className="avatar" src={account.user.picture} alt="" />}
                <span className="dashboard-user">{account.user.name}</span>
                <button className="btn btn-small btn-ghost" onClick={account.logout}>Log out</button>
              </>
            ) : (
              <>
                <span className="dashboard-user">Guest · saved in this browser</span>
                <button className="btn btn-small" onClick={() => account.login()}>Log in</button>
                <button className="btn btn-small btn-ghost" onClick={account.exit}>Exit</button>
              </>
            )}
          </div>
        </header>

        <section className="landing-card create-card">
          <p className="eyebrow">Create</p>
          <h2>Build a new memory palace</h2>
          <form onSubmit={create} className="plaque-form">
            <label>Name<input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Bio 2 midterm" /></label>
            <div className="templates" role="radiogroup" aria-label="Start from">
              {TEMPLATES.map(t => (
                <label key={t.id} className={`template${template === t.id ? ' is-on' : ''}`}>
                  <input type="radio" name="template" checked={template === t.id} onChange={() => setTemplate(t.id)} />
                  <b>{t.title}</b>
                  <span>{t.text}</span>
                </label>
              ))}
            </div>
            {template === 'custom' && (
              <div className="custom-route">
                <label className={`photo-drop${drop.over ? ' is-over' : ''}`} {...drop.props}>
                  <span>Choose or drop photos for your stops<br /><small>Pick several at once. You can rename and reorder them below.</small></span>
                  <input type="file" accept="image/*" multiple hidden onChange={e => { addPhotos(e.target.files); e.target.value = '' }} />
                </label>
                {photos.length > 0 && (
                  <ol className="custom-stops">
                    {photos.map((p, i) => (
                      <li key={p.id}>
                        <img src={p.url} alt="" />
                        <span className="card-num">{i + 1}</span>
                        <input aria-label={`Name of stop ${i + 1}`} value={p.name} onChange={e => setPhotos(ps => ps.map(x => (x.id === p.id ? { ...x, name: e.target.value } : x)))} />
                        <span className="custom-stop-actions">
                          <button type="button" className="icon-btn" disabled={i === 0} onClick={() => movePhoto(i, -1)} aria-label="Move earlier">↑</button>
                          <button type="button" className="icon-btn" disabled={i === photos.length - 1} onClick={() => movePhoto(i, 1)} aria-label="Move later">↓</button>
                          <button type="button" className="icon-btn" onClick={() => removePhoto(p.id)} aria-label="Remove photo">×</button>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
            <div className="row">
              <button className="btn" disabled={busy || (template === 'custom' && !photos.length)}>
                {busy ? 'Building your route…' : template === 'custom' && photos.length ? `Create palace · ${photos.length} stops` : 'Create palace'}
              </button>
            </div>
          </form>
        </section>

        {palaces.length > 0 && (
          <section className="your-palaces">
            <p className="eyebrow">Your palaces</p>
            <ul className="palace-list">
              {palaces.map(p => (
                <li key={p.id} className="landing-card palace-card">
                  <h3>{p.title}</h3>
                  <p className="muted">{p.stops} stops · {p.cards} cards · edited {ago(p.updatedAt)}</p>
                  <div className="row">
                    <button className="btn btn-small btn-danger" onClick={() => setDoomed(p)}>Delete</button>
                    <button className="btn btn-small" onClick={() => onOpen(p.id)}>Open</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {doomed && (
        <ConfirmDialog
          title={`Delete "${doomed.title}"`}
          message={<>Deleting will delete ALL of the information inside of <span className="doomed-name">{doomed.title}</span>. Are you sure you want to continue?</>}

          confirmLabel="Delete"
          countdown={3}
          onConfirm={() => remove(doomed)}
          onCancel={() => setDoomed(null)}
        />
      )}
    </main>
  )
}
