import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { deleteImage, exportPalace, importPalace, loadPalace, prepareImage, putImage, savePalace, useImageUrls } from './storage'
import { addNewBuiltins, newLocation, seedPalace, uid } from './seed'
import Scene from './components/Scene'
import Sky from './components/Sky'
import stadiumUrl from './assets/stadium.webp'
import smathersUrl from './assets/smathers.webp'
import heavenerUrl from './assets/heavener.webp'
import PinPlaque from './components/PinPlaque'
import NotesDrawer from './components/NotesDrawer'
import MenuOverlay from './components/MenuOverlay'
import { QuizStart, QuizStep, QuizSummary } from './components/QuizPanel'

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const stripOffset = ({ offset, ...k }) => (offset == null ? k : { ...k, offset: 1 - offset })
const shuffled = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1])
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
// Images that ship with the app, referenced by name from seed data.
const BUILTIN_IMAGES = { stadium: stadiumUrl, smathers: smathersUrl, heavener: heavenerUrl }

// Camera keyframes for the "fly forward into the distance" transition.
const FAR = { transform: 'scale(0.28)', opacity: 0, filter: 'blur(14px)' }
const HAZY = { transform: 'scale(0.5)', opacity: 0.85, filter: 'blur(6px)', offset: 0.4 }
const HERE = { transform: 'scale(1)', opacity: 1, filter: 'blur(0px)' }
const PASSING = { transform: 'scale(2.3)', opacity: 0, filter: 'blur(10px)', offset: 0.55 }
const PAST = { transform: 'scale(2.6)', opacity: 0, filter: 'blur(10px)' }
const ARRIVE = [FAR, HAZY, HERE]
const HORIZON_MASK = [
  { maskSize: '100% 100%', WebkitMaskSize: '100% 100%' },
  { maskSize: '110% 110%', WebkitMaskSize: '110% 110%', offset: 0.6 },
  { maskSize: '400% 400%', WebkitMaskSize: '400% 400%' },
]
const LEAVE = [HERE, PASSING, PAST]

const isTyping = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')

export default function App() {
  const [palace, setPalace] = useState(() => addNewBuiltins(loadPalace() ?? seedPalace()))
  useEffect(() => savePalace(palace), [palace])
  const locs = palace.locations
  const n = locs.length

  const [index, setIndex] = useState(() => Math.max(0, locs.findIndex(l => slug(l.name) === location.hash.slice(1))))
  const [trans, setTrans] = useState(null) // { from, to, dir }
  const [editing, setEditing] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activePinId, setActivePinId] = useState(null)
  const [quiz, setQuiz] = useState(null) // { stage: 'start' | 'run' | 'done', queue, i, results }
  const imageUrls = useImageUrls(locs)

  const cur = locs[Math.min(index, n - 1)]
  const urlFor = l => (l?.imageId ? imageUrls[l.imageId] : BUILTIN_IMAGES[l?.builtin] ?? null)

  useEffect(() => {
    history.replaceState(null, '', `#${slug(cur.name)}`)
  }, [cur.name])

  // ---- palace mutations -------------------------------------------------
  const updateLoc = useCallback((id, patch) => setPalace(p => ({
    ...p,
    locations: p.locations.map(l => (l.id === id ? { ...l, ...(typeof patch === 'function' ? patch(l) : patch) } : l)),
  })), [])
  const updatePin = (locId, pinId, patch) =>
    updateLoc(locId, l => ({ pins: l.pins.map(p => (p.id === pinId ? { ...p, ...patch } : p)) }))
  const addPin = (x, y) => {
    const pin = { id: uid(), x, y, topic: '', question: '', answer: '', stats: { right: 0, wrong: 0 } }
    updateLoc(cur.id, l => ({ pins: [...l.pins, pin] }))
    setActivePinId(pin.id)
  }
  const deletePin = pinId => {
    updateLoc(cur.id, l => ({ pins: l.pins.filter(p => p.id !== pinId) }))
    setActivePinId(null)
  }

  // ---- photos -----------------------------------------------------------
  const fileInput = useRef(null)
  const uploadTarget = useRef(null)
  const askUpload = locId => {
    uploadTarget.current = locId
    fileInput.current.click()
  }
  const setPhoto = async (locId, file) => {
    if (!file?.type.startsWith('image/')) return
    try {
      const { blob, ar, cutout } = await prepareImage(file)
      const imageId = uid()
      await putImage(imageId, blob)
      const old = locs.find(l => l.id === locId)?.imageId
      updateLoc(locId, { imageId, ar, cutout, builtin: null })
      if (old) deleteImage(old)
    } catch {
      alert('That image could not be read. Try a JPG or PNG (iPhone HEIC photos may need converting).')
    }
  }
  const removePhoto = () => {
    if (cur.imageId) deleteImage(cur.imageId)
    updateLoc(cur.id, { imageId: null, builtin: null, cutout: false, ar: 16 / 9 })
  }

  // ---- navigation: fly forward into the distance ----------------------
  const goTo = useCallback((to, dir) => {
    if (trans || to === index || to < 0 || to >= n) return
    setActivePinId(null)
    if (reducedMotion()) return setIndex(to)
    setTrans({ from: index, to, dir: dir ?? (to > index ? 'next' : 'prev') })
  }, [trans, index, n])
  const next = () => goTo((index + 1) % n, 'next')
  const prev = () => goTo((index - 1 + n) % n, 'prev')

  const inRef = useRef(null)
  const outRef = useRef(null)
  useLayoutEffect(() => {
    if (!trans) return
    const opts = { duration: 1500, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'both' }
    // Going forward, the current place rushes past the camera while the next one
    // grows out of the haze. Going back plays the same motion in reverse.
    const forward = trans.dir === 'next'
    const anims = [
      outRef.current.animate(forward ? LEAVE : [...ARRIVE].reverse().map(stripOffset), opts),
      inRef.current.animate(forward ? ARRIVE : [...LEAVE].reverse().map(stripOffset), opts),
    ]
    // Feather the edges of whichever scene is out in the distance so it reads as
    // a place on the horizon, not a shrunken rectangle; the mask opens as it nears.
    const distant = forward ? inRef.current : outRef.current
    distant.classList.add('is-distant')
    const mask = forward ? HORIZON_MASK : [...HORIZON_MASK].reverse().map(stripOffset)
    anims.push(distant.animate(mask, opts))
    let live = true
    Promise.all(anims.slice(0, 2).map(a => a.finished)).then(() => {
      if (!live) return
      flushSync(() => {
        setIndex(trans.to)
        setTrans(null)
      })
      anims.forEach(a => a.cancel())
      distant.classList.remove('is-distant')
    }).catch(() => {})
    return () => { live = false }
  }, [trans])

  // ---- quiz ------------------------------------------------------------
  const startQuiz = (scope, shuffle, only) => {
    const pool = scope === 'here' ? [cur] : locs
    const queue = pool.flatMap(l => {
      const pins = l.pins.filter(p => !only || only.has(p.id))
      return (shuffle ? shuffled(pins) : pins).map(p => ({ locId: l.id, pinId: p.id }))
    })
    if (!queue.length) return
    setEditing(false)
    setNotesOpen(false)
    setActivePinId(null)
    setQuiz({ stage: 'run', queue, i: 0, results: [] })
  }
  const step = quiz?.stage === 'run' ? quiz.queue[quiz.i] : null
  const stepLocIndex = step ? locs.findIndex(l => l.id === step.locId) : -1
  useEffect(() => {
    if (stepLocIndex >= 0 && stepLocIndex !== index && !trans) {
      goTo(stepLocIndex, stepLocIndex === (index - 1 + n) % n ? 'prev' : 'next')
    }
  }, [stepLocIndex, index, trans, goTo, n])
  const grade = ok => {
    const pin = locs[stepLocIndex].pins.find(p => p.id === step.pinId)
    updatePin(step.locId, step.pinId, { stats: { right: pin.stats.right + ok, wrong: pin.stats.wrong + !ok } })
    const results = [...quiz.results, { ...step, ok }]
    setQuiz(q => (q.i + 1 >= q.queue.length ? { ...q, stage: 'done', results } : { ...q, i: q.i + 1, results }))
  }

  // ---- keyboard + drag-and-drop ----------------------------------------
  useEffect(() => {
    const onKey = e => {
      if (isTyping(document.activeElement)) return
      if (e.key === 'ArrowRight' && !quiz) next()
      if (e.key === 'ArrowLeft' && !quiz) prev()
      if (e.key === 'Escape') { setActivePinId(null); setMenuOpen(false) }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })
  const [dragOver, setDragOver] = useState(false)

  // ---- render ----------------------------------------------------------
  // Whichever layer moves toward the camera is drawn on top.
  const layers = !trans
    ? [{ i: index }]
    : trans.dir === 'next'
      ? [{ i: trans.to, ref: inRef }, { i: trans.from, ref: outRef }]
      : [{ i: trans.from, ref: outRef }, { i: trans.to, ref: inRef }]
  const activePin = cur.pins.find(p => p.id === activePinId)
  const totalCards = locs.reduce((s, l) => s + l.pins.length, 0)

  return (
    <main
      className={`app${dragOver ? ' is-dragover' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={e => { if (e.target === e.currentTarget) setDragOver(false) }}
      onDrop={e => { e.preventDefault(); setDragOver(false); setPhoto(cur.id, e.dataTransfer.files[0]) }}
    >
      <Sky />
      <div className="stage">
        {layers.map(({ i, ref }) => {
          const l = locs[i]
          return (
            <div className="layer" key={l.id} ref={ref}>
              <Scene
                loc={l}
                url={urlFor(l)}
                interactive={!trans}
                editing={editing && !trans}
                quizzing={!!quiz}
                hideHint={!!activePinId || notesOpen}
                activePinId={activePinId}
                highlightPinId={step?.pinId}
                onAddPin={addPin}
                onSelectPin={id => setActivePinId(a => (a === id ? null : id))}
                onMovePin={(id, x, y) => updatePin(l.id, id, { x, y })}
                onUpload={() => askUpload(l.id)}
              />
            </div>
          )
        })}
      </div>

      <header className="hud-top">
        <div className="brand">UF<span>·</span>MP</div>
        <button className="hamburger" onClick={() => setMenuOpen(true)} aria-label="Open map"><span /><span /><span /></button>
      </header>

      {editing && !quiz && (
        <div className="edit-banner">Editing · click the scene to pin a card · drag pins to move them</div>
      )}

      <nav className="hud-bottom">
        <div className="toolbar">
          <button className={`chip${notesOpen ? ' is-on' : ''}`} onClick={() => setNotesOpen(o => !o)} disabled={!!quiz}>Notes</button>
          <button className={`chip${editing ? ' is-on' : ''}`} onClick={() => { setEditing(e => !e); setActivePinId(null) }} disabled={!!quiz}>Edit</button>
          <button className="chip chip-primary" onClick={() => setQuiz({ stage: 'start' })} disabled={!!quiz}>Walk &amp; quiz</button>
          <div className="dots" aria-hidden="true">
            {locs.map((l, i) => <span key={l.id} className={i === (trans ? trans.to : index) ? 'is-on' : ''} />)}
          </div>
        </div>
        <div className="arrows">
          <button className="arrow" onClick={prev} disabled={!!quiz || n < 2} aria-label="Previous location">←</button>
          <button className="arrow" onClick={next} disabled={!!quiz || n < 2} aria-label="Next location">→</button>
        </div>
      </nav>

      {activePin && !quiz && (
        <PinPlaque
          key={activePin.id}
          pin={activePin}
          n={cur.pins.indexOf(activePin) + 1}
          editing={editing}
          onChange={patch => updatePin(cur.id, activePin.id, patch)}
          onDelete={() => deletePin(activePin.id)}
          onClose={() => setActivePinId(null)}
        />
      )}

      {quiz?.stage === 'start' && (
        <QuizStart
          here={cur.name}
          total={totalCards}
          hereCount={cur.pins.length}
          onStart={startQuiz}
          onClose={() => setQuiz(null)}
        />
      )}
      {step && stepLocIndex === index && !trans && (
        <QuizStep
          key={quiz.i}
          step={quiz.i}
          total={quiz.queue.length}
          locName={cur.name}
          pin={cur.pins.find(p => p.id === step.pinId)}
          onGrade={grade}
          onStop={() => setQuiz({ ...quiz, stage: 'done' })}
        />
      )}
      {quiz?.stage === 'done' && (
        <QuizSummary
          results={quiz.results}
          locations={locs}
          onRetryMissed={() => startQuiz('all', false, new Set(quiz.results.filter(r => !r.ok).map(r => r.pinId)))}
          onClose={() => setQuiz(null)}
        />
      )}

      {notesOpen && !quiz && (
        <NotesDrawer
          loc={cur}
          editing={editing}
          activePinId={activePinId}
          onChange={patch => updateLoc(cur.id, patch)}
          onPinChange={(id, patch) => updatePin(cur.id, id, patch)}
          onSelectPin={id => setActivePinId(id)}
          onAddCard={() => { setEditing(true); addPin(40 + Math.random() * 20, 40 + Math.random() * 20) }}
          onDeletePin={deletePin}
          onUpload={() => askUpload(cur.id)}
          onRemovePhoto={removePhoto}
          onDeleteLocation={() => {
            if (n < 2 || !confirm(`Delete ${cur.name} and its ${cur.pins.length} cards?`)) return
            if (cur.imageId) deleteImage(cur.imageId)
            setPalace(p => ({ ...p, locations: p.locations.filter(l => l.id !== cur.id) }))
            setIndex(i => Math.max(0, Math.min(i, n - 2)))
          }}
          onClose={() => setNotesOpen(false)}
        />
      )}

      {menuOpen && (
        <MenuOverlay
          locations={locs}
          index={index}
          onGo={i => { setMenuOpen(false); goTo(i) }}
          onMove={(i, d) => {
            setPalace(p => {
              const ls = [...p.locations]
              ;[ls[i], ls[i + d]] = [ls[i + d], ls[i]]
              return { ...p, locations: ls }
            })
            if (i === index) setIndex(i + d)
            else if (i + d === index) setIndex(i)
          }}
          onAdd={() => {
            setPalace(p => ({ ...p, locations: [...p.locations, newLocation(p.locations.length)] }))
            setMenuOpen(false)
            setIndex(n)
            setEditing(true)
            setNotesOpen(true)
          }}
          onExport={() => exportPalace(palace)}
          onImport={async file => {
            try {
              setPalace(await importPalace(file))
              setIndex(0)
              setMenuOpen(false)
            } catch (err) {
              alert(`Import failed: ${err.message}`)
            }
          }}
          onReset={() => {
            if (!confirm('Replace your palace with the sample UF route? Export first if you want a backup.')) return
            setPalace(seedPalace())
            setIndex(0)
            setMenuOpen(false)
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={e => { setPhoto(uploadTarget.current, e.target.files[0]); e.target.value = '' }}
      />
      {dragOver && <div className="drop-hint">Drop to set the photo for {cur.name}</div>}
    </main>
  )
}
