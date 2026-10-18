import { useEffect, useState } from 'react'
import { blankPalace, blankRoutePalace, customPalace, tutorialPalace, uid } from '../seed'
import { createPalace, deletePalace, listPalaces, loadPalace, markTutorialSeen, prepareImage, putImage, savePalace, tutorialSeen } from '../storage'
import Sky from './Sky'
import ConfirmDialog from './ConfirmDialog'
import Settings from './Settings'
import { notify, useFileDrop } from '../useFileDrop'
import { openFromAccount } from '../account'
import Brand from './Brand'
import AccountMenu from './AccountMenu'
import StudioButton from './StudioButton'

const TEMPLATES = [
  { id: 'route', title: 'UF campus route', text: 'The campus stops, ready for your own topics, terms and cards.' },
  { id: 'custom', title: 'Custom route', text: 'Upload your own photos. Each one becomes a stop, in order.' },
  { id: 'blank', title: 'Blank palace', text: 'Start empty and add your own stops and photos as you go.' },
  // { id: 'template', title: 'TEMPLATE', text: 'COMMENT OUT LATER.' },
  // DOESN'T WORK :// 
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
  const [renaming, setRenaming] = useState(null) // { id, title } while a palace's name is being edited
  // Palaces saved to the account (signed-in users). Ones already in this browser show in "Your palaces".
  const [remote, setRemote] = useState(null)
  const [remoteError, setRemoteError] = useState(null)
  const [fetching, setFetching] = useState(null) // id of the account palace being downloaded
  const api = account.api
  useEffect(() => {
    if (!api) return
    api('/palaces').then(setRemote, e => setRemoteError(e.message))
  }, [api])
  const here = new Set(palaces.map(p => p.account).filter(Boolean))
  const accountOnly = (remote ?? []).filter(r => !here.has(r.id))
  const download = async r => {
    setFetching(r.id)
    try {
      onOpen(createPalace(sub, await openFromAccount(account.api, r.id)))
    } catch (e) {
      notify(e.message)
      setFetching(null)
    }
  }
  // Brand-new accounts get a welcome with the tutorial, or skip straight to creating.
  const [welcome, setWelcome] = useState(() => !palaces.length && !tutorialSeen(sub))
  const skipTutorial = () => {
    markTutorialSeen(sub)
    setWelcome(false)
  }
  const startTutorial = () => {
    markTutorialSeen(sub)
    onOpen(createPalace(sub, tutorialPalace()))
  }

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
    const name = title.trim() || ({ custom: 'My route', blank: 'Blank palace' }[template] ?? 'New palace')
    if (template !== 'custom') {
      const make = { route: () => blankRoutePalace(name), blank: () => blankPalace(name) }
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

  const remove = async p => {
    if (p.remote) {
      setDoomed(null)
      try {
        await account.api(`/palaces/${p.id}`, { method: 'DELETE' })
        setRemote(rs => rs.filter(r => r.id !== p.id))
      } catch (e) {
        notify(e.message)
      }
      return
    }
    deletePalace(sub, p.id)
    setPalaces(listPalaces(sub))
    setDoomed(null)
  }

  function rename(e) {
    e.preventDefault()
    const title = renaming.title.trim()
    const palace = loadPalace(sub, renaming.id)
    setRenaming(null)
    if (!title || !palace || title === palace.title) return
    savePalace(sub, renaming.id, { ...palace, title })
    setPalaces(listPalaces(sub))
  }

  return (
    <main className="landing dashboard">
      <Sky night={prefs.night} />
      <div className="dashboard-content">
        <header className="dashboard-head">
          <Brand />
          <div className="row">
            <StudioButton />
            <Settings prefs={prefs} />
            <AccountMenu account={account} />
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
                  {renaming?.id === p.id ? (
                    <form className="row palace-rename" onSubmit={rename}>
                      <input autoFocus maxLength={80} value={renaming.title} aria-label="Palace name"
                        onChange={e => setRenaming({ id: p.id, title: e.target.value })}
                        onKeyDown={e => e.key === 'Escape' && setRenaming(null)} />
                      <button className="btn btn-small">Save</button>
                      <button type="button" className="btn btn-small btn-ghost" onClick={() => setRenaming(null)}>Cancel</button>
                    </form>
                  ) : <h3>{p.title}</h3>}
                  <p className="muted">{p.stops} stops · {p.cards} cards · edited {ago(p.updatedAt)}{p.account && ' · in your account'}</p>
                  <div className="row">
                    <button className="btn btn-small btn-danger" onClick={() => setDoomed(p)}>Delete</button>
                    <button className="btn btn-small btn-ghost" onClick={() => setRenaming({ id: p.id, title: p.title })}>Rename</button>
                    <button className="btn btn-small" onClick={() => onOpen(p.id)}>Open</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {account.api && (accountOnly.length > 0 || remoteError) && (
          <section className="your-palaces">
            <p className="eyebrow">In your account</p>
            {remoteError && <p className="landing-card muted">Couldn't load your account's palaces: {remoteError}</p>}
            <ul className="palace-list">
              {accountOnly.map(r => (
                <li key={r.id} className="landing-card palace-card">
                  <h3>{r.title}</h3>
                  <p className="muted">{r.stop_count} stops · saved {r.created_at ? ago(Date.parse(r.created_at.endsWith('Z') ? r.created_at : `${r.created_at}Z`)) : ''} · not in this browser yet</p>
                  <div className="row">
                    <button className="btn btn-small btn-danger" onClick={() => setDoomed({ ...r, remote: true })}>Delete</button>
                    <button className="btn btn-small" disabled={fetching === r.id} onClick={() => download(r)}>{fetching === r.id ? 'Opening…' : 'Open'}</button>
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
          message={<>Deleting will delete ALL of the information inside of <span className="doomed-name">{doomed.title}</span>{doomed.remote && ' from your account'}. Are you sure you want to continue?</>}

          confirmLabel="Delete"
          countdown={3}
          onConfirm={() => remove(doomed)}
          onCancel={() => setDoomed(null)}
        />
      )}
      {welcome && (
        <div className="dialog-backdrop">
          <section className="plaque dialog welcome" role="dialog" aria-label="Welcome">
            <p className="eyebrow">Welcome</p>
            <h2 className="plaque-q">New to memory palaces?</h2>
            <p>Take a quick tutorial with an example palace to see how stops, cards, walks and quizzes work, or skip it and build your own.</p>
            <div className="row">
              <button className="btn btn-ghost" onClick={skipTutorial}>Skip tutorial</button>
              <button className="btn" autoFocus onClick={startTutorial}>Start tutorial</button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
