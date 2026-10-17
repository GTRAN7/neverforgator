import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { cursorFromImage, deleteImage, exportPalace, imageIdsOf, importPalace, loadPalace, prepareImage, putImage, savePalace, useImageUrls } from './storage'
import { campusCatalog, newLocation, resetPalace, seedPalace, uid, upgradePalace } from './seed'
import Scene from './components/Scene'
import Sky from './components/Sky'
import stadiumUrl from './assets/stadium.webp'
import smathersUrl from './assets/smathers.webp'
import heavenerUrl from './assets/heavener.webp'
import PinPlaque from './components/PinPlaque'
import NotesDrawer from './components/NotesDrawer'
import MenuOverlay from './components/MenuOverlay'
import AddLocationDialog from './components/AddLocationDialog'
import ConfirmDialog from './components/ConfirmDialog'
import AppearancePanel from './components/AppearancePanel'
import Settings from './components/Settings'
import { openAbout } from './about'
import { lookOf, lookStyle, signLayoutOf } from './appearance'
import { imagesFromDrop } from './useFileDrop'
import { EndOfRoute, QuizStart, QuizStep, QuizSummary, WalkPanel } from './components/QuizPanel'

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

// `account` comes from the Auth0 gate in src/App.jsx: { user, logout } when
// signed in, or { guest, login, exit } for the sample palace.
export default function PalaceApp({ account, palaceId, onExit, prefs }) {
  const sub = account.user?.sub
  const [palace, setPalace] = useState(() => upgradePalace(loadPalace(sub, palaceId) ?? seedPalace()))
  useEffect(() => savePalace(sub, palaceId, palace), [palace, sub, palaceId])
  const locs = palace.locations
  const n = locs.length

  const [index, setIndex] = useState(() => Math.max(0, locs.findIndex(l => slug(l.name) === location.hash.split('/')[1])))
  const [trans, setTrans] = useState(null) // { from, to, dir }
  const [editing, setEditing] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [activePinId, setActivePinId] = useState(null)
  const [quiz, setQuiz] = useState(null) // { stage: 'start' | 'run' | 'done', queue, i, results, revealed }
  const [walking, setWalking] = useState(false)
  const [adding, setAdding] = useState(false)
  const [endCard, setEndCard] = useState(false)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [editFocus, setEditFocus] = useState(0) // bumped when the sign is clicked: focus the name field
  const imageUrls = useImageUrls(imageIdsOf(palace))

  const cur = locs[Math.min(index, n - 1)]
  const look = lookOf(palace)
  const setLook = patch => setPalace(p => ({ ...p, appearance: { ...lookOf(p), ...patch } }))
  const lookCss = lookStyle(look)
  const signArt = { url: look.signImageId ? imageUrls[look.signImageId] : null, layout: signLayoutOf(look) }
  const urlFor = l => (l?.imageId ? imageUrls[l.imageId] : BUILTIN_IMAGES[l?.builtin] ?? null)

  useEffect(() => {
    history.replaceState(null, '', `#${palaceId}/${slug(cur.name)}`)
  }, [palaceId, cur.name])

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
  // A card with nothing written and no photo is dropped when you close it.
  const isBlankPin = p => !p.topic?.trim() && !p.question?.trim() && !p.answer?.trim() && !p.imageId
  const deselectPin = () => {
    const open = activePinId && cur.pins.find(p => p.id === activePinId)
    if (open && isBlankPin(open)) updateLoc(cur.id, l => ({ pins: l.pins.filter(p => p.id !== open.id) }))
    setActivePinId(null)
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
  // Card photos: stored right away; the card just keeps the image id.
  const storePhoto = async file => {
    if (!file?.type.startsWith('image/')) return null
    try {
      const { blob } = await prepareImage(file, 1600)
      const id = uid()
      await putImage(id, blob)
      return { id, url: URL.createObjectURL(blob) }
    } catch {
      alert('That image could not be read. Try a JPG or PNG (iPhone HEIC photos may need converting).')
      return null
    }
  }
  const removePhoto = () => {
    if (cur.imageId) deleteImage(cur.imageId)
    updateLoc(cur.id, { imageId: null, builtin: null, cutout: false, ar: 16 / 9 })
  }

  // ---- quiz zoom (Advanced appearance): move the camera onto the card's spot ----
  // The scene layer is scaled up and shifted so the highlighted pin lands above
  // the question panel. zoomRef remembers the current transform so the next pin
  // can be located in unzoomed coordinates.
  const zoomRef = useRef({ s: 1, tx: 0, ty: 0 })
  const clearZoom = () => {
    const layer = document.querySelector('.stage .layer')
    if (layer) Object.assign(layer.style, { transition: 'none', transform: '', transformOrigin: '' })
    zoomRef.current = { s: 1, tx: 0, ty: 0 }
  }

  // ---- navigation: fly forward into the distance ----------------------
  const notesDirty = useRef(false)
  // In-app confirmations (browser confirm() popups can be blocked in embedded views).
  const [dialog, setDialog] = useState(null)
  const ask = (opts, run) => setDialog({ ...opts, run })
  const discardNotes = then => ask(
    { title: 'Unsaved notes', message: 'Discard your unsaved stop notes?', confirmLabel: 'Discard' },
    () => { notesDirty.current = false; then() },
  )
  const flyTo = (to, dir) => {
    clearZoom()
    deselectPin()
    setEndCard(false)
    if (reducedMotion()) return setIndex(to)
    setTrans({ from: index, to, dir: dir ?? (to > index ? 'next' : 'prev') })
  }
  const goTo = useCallback((to, dir) => {
    if (trans || to === index || to < 0 || to >= n) return
    if (notesDirty.current) return discardNotes(() => flyTo(to, dir))
    flyTo(to, dir)
  }, [trans, index, n]) // eslint-disable-line react-hooks/exhaustive-deps
  // Past the last stop, offer a quiz or another lap instead of silently wrapping.
  const next = () => {
    if (!walking && !quiz && n > 1 && index === n - 1) return setEndCard(true)
    goTo((index + 1) % n, 'next')
  }
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

  // ---- walkthrough ------------------------------------------------------
  // Notes, Edit, Walk and Quiz are modes: only one can be on at a time.
  const mode = quiz ? 'quiz' : walking ? 'walk' : editing ? 'edit' : notesOpen ? 'notes' : null
  const switchMode = (m, quizEnded = false) => {
    if (!quizEnded && quiz?.stage === 'run' && quiz.i > 0 && m !== 'quiz') {
      return ask(
        { title: 'End quiz', message: 'End the quiz? Your progress will be lost.', confirmLabel: 'End quiz' },
        () => switchMode(m, true),
      )
    }
    if (notesDirty.current && m !== 'notes') return discardNotes(() => switchMode(m, quizEnded))
    deselectPin()
    setEndCard(false)
    if (m) setAppearanceOpen(false)
    setNotesOpen(m === 'notes')
    setEditing(m === 'edit')
    setWalking(m === 'walk')
    setQuiz(m === 'quiz' ? q => q ?? { stage: 'start' } : null)
    if (m === 'walk' && index !== 0) goTo(0, 'prev')
  }
  const toggleMode = m => switchMode(mode === m ? null : m)

  // ---- quiz ------------------------------------------------------------
  // Questions go both ways (README): "What's at <stop>?" on the walk, then
  // "Where did you put <concept>?" at the end, plus any pinned cards.
  const startQuiz = (scope, opts, preset) => {
    let queue = preset
    if (!queue) {
      const pool = (scope === 'here' ? [cur] : locs).filter(l => !opts.stops || opts.chosen.includes(l.id))
      const walk = pool.flatMap(l => [
        ...(opts.concepts && l.concept ? [{ kind: 'what', locId: l.id }] : []),
        ...(opts.cards ? (opts.shuffle ? shuffled(l.pins) : l.pins)
          .filter(p => !opts.starredOnly || p.starred)
          .map(p => ({ kind: 'card', locId: l.id, pinId: p.id })) : []),
      ])
      const where = opts.concepts ? shuffled(pool.filter(l => l.concept)).map(l => ({ kind: 'where', locId: l.id })) : []
      queue = [...walk, ...where]
    }
    if (!queue.length) return
    setEditing(false)
    setNotesOpen(false)
    deselectPin()
    setWalking(false)
    setQuiz({ stage: 'run', queue, i: 0, results: [], revealed: false })
  }
  const step = quiz?.stage === 'run' ? quiz.queue[quiz.i] : null
  const stepLocIndex = step ? locs.findIndex(l => l.id === step.locId) : -1
  const stepLoc = locs[stepLocIndex]
  // "Where did you put…" questions stay put until revealed, then fly to the answer.
  const travel = !!step && (step.kind !== 'where' || quiz.revealed)
  useEffect(() => {
    if (travel && stepLocIndex >= 0 && stepLocIndex !== index && !trans) {
      // Runs after any in-flight transition ends, which an event handler can't wait for.
      // oxlint-disable-next-line react/set-state-in-effect
      goTo(stepLocIndex, stepLocIndex === (index - 1 + n) % n ? 'prev' : 'next')
    }
  }, [travel, stepLocIndex, index, trans, goTo, n])
  const bump = (stats, ok) => ({ right: (stats?.right ?? 0) + ok, wrong: (stats?.wrong ?? 0) + !ok })
  const grade = ok => {
    if (step.kind === 'card') {
      const pin = stepLoc.pins.find(p => p.id === step.pinId)
      if (pin) updatePin(step.locId, step.pinId, { stats: bump(pin.stats, ok) })
    } else {
      updateLoc(step.locId, l => ({ stats: bump(l.stats, ok) }))
    }
    const results = [...quiz.results, { ...step, ok }]
    setQuiz(q => (q.i + 1 >= q.queue.length
      ? { ...q, stage: 'done', results }
      : { ...q, i: q.i + 1, results, revealed: false }))
  }
  const stepContent = () => {
    const memory = <>
      {stepLoc.definition && <p className="definition">{stepLoc.definition}</p>}
      {stepLoc.association && <p className="muted">{stepLoc.association}</p>}
    </>
    if (step.kind === 'what') {
      return {
        eyebrow: stepLoc.name,
        question: `What did you put at ${stepLoc.name}?`,
        answer: <><strong>{stepLoc.concept}</strong>{memory}</>,
      }
    }
    if (step.kind === 'where') {
      return {
        eyebrow: 'Where is it?',
        question: `Where did you put “${stepLoc.concept}”?`,
        answer: <><strong>{stepLoc.name}</strong>{memory}</>,
        onReveal: () => setQuiz(q => ({ ...q, revealed: true })),
      }
    }
    const pin = stepLoc.pins.find(p => p.id === step.pinId)
    return {
      eyebrow: `${stepLoc.name}${pin?.topic ? ` · ${pin.topic}` : ''}`,
      question: pin?.question || 'What lives at this spot?',
      image: pin?.imageId ? imageUrls[pin.imageId] : null,
      imageWithAnswer: pin?.photoWith === 'answer',
      answer: pin?.answer || <em>No answer saved.</em>,
      starred: pin?.starred,
      onStar: pin ? () => updatePin(step.locId, step.pinId, { starred: !pin.starred }) : null,
    }
  }
  const showStep = !!step && (step.kind === 'where' || (stepLocIndex === index && !trans))
  const zoomPinId = look.quizZoom && step?.kind === 'card' && stepLocIndex === index && !trans ? step.pinId : null
  useLayoutEffect(() => {
    const layer = document.querySelector('.stage .layer')
    if (!layer) return
    const z = zoomRef.current
    if (!zoomPinId) {
      // Quiz moved on or ended: ease back out.
      if (z.s !== 1) {
        Object.assign(layer.style, { transition: 'transform 0.7s cubic-bezier(.4,0,.2,1)', transform: '' })
        zoomRef.current = { s: 1, tx: 0, ty: 0 }
      }
      return
    }
    const pin = layer.querySelector('.pin.is-highlight .pin-num')
    if (!pin) return
    const r = pin.getBoundingClientRect()
    const px = (r.left + r.width / 2 - z.tx) / z.s
    const py = (r.top + r.height / 2 - z.ty) / z.s
    const s = 1.8
    const tx = innerWidth / 2 - s * px
    const ty = innerHeight * 0.3 - s * py
    Object.assign(layer.style, {
      transformOrigin: '0 0',
      transition: 'transform 0.9s cubic-bezier(.4,0,.2,1)',
      transform: `translate(${tx}px, ${ty}px) scale(${s})`,
    })
    zoomRef.current = { s, tx, ty }
  }, [zoomPinId])
  const hidingPlace = step?.kind === 'where' && !quiz.revealed

  // ---- keyboard + drag-and-drop ----------------------------------------
  useEffect(() => {
    const onKey = e => {
      if (isTyping(document.activeElement)) return
      if (e.key === 'ArrowRight' && !quiz && !(walking && index === n - 1)) next()
      if (e.key === 'ArrowLeft' && !quiz && !(walking && index === 0)) prev()
      if (e.key === 'Escape') { deselectPin(); setMenuOpen(false); setAdding(false); setEndCard(false) }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })
  // Dropping a photo on the scene sets this stop's photo. dragover keeps firing
  // while a file hovers the scene, so the hint switches itself off shortly after
  // it stops (left the window, dropped, or moved onto a drop area of its own).
  const [dragOver, setDragOver] = useState(false)
  const dragTimer = useRef(null)
  const onSceneDragOver = e => {
    e.preventDefault()
    setDragOver(true)
    clearTimeout(dragTimer.current)
    dragTimer.current = setTimeout(() => setDragOver(false), 150)
  }

  // ---- render ----------------------------------------------------------
  // Whichever layer moves toward the camera is drawn on top.
  const layers = !trans
    ? [{ i: index }]
    : trans.dir === 'next'
      ? [{ i: trans.to, ref: inRef }, { i: trans.from, ref: outRef }]
      : [{ i: trans.from, ref: outRef }, { i: trans.to, ref: inRef }]
  const activePin = cur.pins.find(p => p.id === activePinId)
  const busy = !!quiz || walking

  return (
    <main
      className={`app${dragOver ? ' is-dragover' : ''}${hidingPlace ? ' is-hiding-place' : ''}${lookCss.className}`}
      style={lookCss.style}
      onDragOver={onSceneDragOver}
      onDrop={e => {
        e.preventDefault()
        setDragOver(false)
        if (busy || adding || appearanceOpen || menuOpen) return
        const stopId = cur.id
        imagesFromDrop(e.dataTransfer).then(([image]) => image && setPhoto(stopId, image))
      }}
    >
      <Sky look={look} imageUrl={look.skyImageId ? imageUrls[look.skyImageId] : null} night={prefs.night} />
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
                hideHint={!!activePinId || notesOpen || walking}
                activePinId={activePinId}
                highlightPinId={step?.kind === 'card' ? step.pinId : null}
                onAddPin={addPin}
                onSelectPin={id => {
                  deselectPin()
                  if (id !== activePinId) setActivePinId(id)
                }}
                onMovePin={(id, x, y) => updatePin(l.id, id, { x, y })}
                onUpload={() => askUpload(l.id)}
                signArt={signArt}
                onEditStop={() => {
                  if (mode !== 'notes') switchMode('notes')
                  setEditFocus(f => f + 1)
                }}
              />
            </div>
          )
        })}
      </div>

      <header className="hud-top">
        <button className="brand" onClick={openAbout} title="About UF Memory Palace">UF<span>·</span>MP</button>
        <div className="hud-actions">
          <Settings
            prefs={prefs}
            onAppearance={() => {
              setMenuOpen(false)
              switchMode(null)
              setAppearanceOpen(true)
            }}
          />
          <button className="hamburger" onClick={() => setMenuOpen(true)} aria-label="Open map"><span /><span /><span /></button>
        </div>
      </header>

      {editing && !quiz && (
        <div className="edit-banner">Editing · click the scene to pin a card · drag pins to move them</div>
      )}

      <nav className="hud-bottom">
        <div className="toolbar">
          {[['notes', 'Notes'], ['edit', 'Edit'], ['walk', 'Walk'], ['quiz', 'Quiz']].map(([m, label]) => (
            <button key={m} className={`chip${m === 'quiz' ? ' chip-primary' : ''}${mode === m ? ' is-on' : ''}`} aria-pressed={mode === m} onClick={() => toggleMode(m)}>
              {label}
            </button>
          ))}
          <div className="dots" aria-hidden="true">
            {locs.map((l, i) => <span key={l.id} className={i === (trans ? trans.to : index) ? 'is-on' : ''} />)}
          </div>
        </div>
        <div className="arrows">
          <button className="arrow" onClick={prev} disabled={!!quiz || n < 2 || (walking && index === 0)} aria-label="Previous location">←</button>
          <button className="arrow" onClick={next} disabled={!!quiz || n < 2 || (walking && index === n - 1)} aria-label="Next location">→</button>
        </div>
      </nav>

      {activePin && !busy && !notesOpen && (
        <PinPlaque
          key={activePin.id}
          pin={activePin}
          n={cur.pins.indexOf(activePin) + 1}
          editing={editing}
          photoUrl={activePin.imageId ? imageUrls[activePin.imageId] : null}
          onPhoto={async file => {
            const stored = await storePhoto(file)
            if (stored) updatePin(cur.id, activePin.id, { imageId: stored.id })
          }}
          onChange={patch => updatePin(cur.id, activePin.id, patch)}
          onDelete={() => deletePin(activePin.id)}
          onClose={deselectPin}
        />
      )}

      {quiz?.stage === 'start' && (
        <QuizStart
          here={cur.name}
          current={cur}
          stops={locs}
          onStart={startQuiz}
          onClose={() => setQuiz(null)}
        />
      )}
      {showStep && (
        <QuizStep
          key={quiz.i}
          step={quiz.i}
          total={quiz.queue.length}
          {...stepContent()}
          onGrade={grade}
          onStop={() => setQuiz({ ...quiz, stage: 'done' })}
        />
      )}
      {endCard && !busy && !trans && (
        <EndOfRoute
          stops={n}
          onAddStop={() => { setEndCard(false); setAdding(true) }}
          onQuiz={() => switchMode('quiz')}
          onContinue={() => goTo(0, 'next')}
          onClose={() => setEndCard(false)}
        />
      )}
      {walking && !trans && (
        <WalkPanel
          loc={cur}
          stop={index}
          total={n}
          onPrev={prev}
          onNext={next}
          onQuiz={() => switchMode('quiz')}
          onStop={() => switchMode(null)}
        />
      )}
      {quiz?.stage === 'done' && (
        <QuizSummary
          results={quiz.results}
          locations={locs}
          onRetryMissed={() => startQuiz('all', null, quiz.results.filter(r => !r.ok).map(({ ok: _ok, ...q }) => q))}
          onClose={() => setQuiz(null)}
        />
      )}

      {notesOpen && !busy && (
        <NotesDrawer
          key={cur.id}
          loc={cur}
          activePinId={activePinId}
          imageUrls={imageUrls}
          storePhoto={storePhoto}
          focusName={editFocus}
          onSave={patch => updateLoc(cur.id, patch)}
          onDirty={d => { notesDirty.current = d }}
          onSelectPin={id => setActivePinId(id)}
          onUpload={() => askUpload(cur.id)}
          onRemovePhoto={removePhoto}
          onDeleteLocation={() => {
            if (n < 2) return alert('A palace needs at least one stop.')
            const doomed = cur
            ask({ title: 'Delete location', message: `Delete ${doomed.name} and its ${doomed.pins.length} cards?`, confirmLabel: 'Delete' }, () => {
              notesDirty.current = false
              ;[doomed.imageId, ...doomed.pins.map(p => p.imageId)].filter(Boolean).forEach(id => deleteImage(id))
              setPalace(p => ({ ...p, locations: p.locations.filter(l => l.id !== doomed.id) }))
              setIndex(i => Math.max(0, Math.min(i, n - 2)))
            })
          }}
          onClose={() => switchMode(null)}
        />
      )}

      {menuOpen && (
        <MenuOverlay
          locations={locs}
          index={index}
          account={account}
          title={palace.title}
          onRename={title => setPalace(p => ({ ...p, title }))}
          onExit={onExit}
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
            setMenuOpen(false)
            setAdding(true)
          }}
          onAddPhotos={async files => {
            const images = files.filter(f => f.type.startsWith('image/'))
            if (!images.length) return
            setMenuOpen(false)
            const added = []
            for (const file of images) {
              try {
                const { blob, ar, cutout } = await prepareImage(file)
                const imageId = uid()
                await putImage(imageId, blob)
                const name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'New stop'
                added.push({ ...newLocation({ name }, n + added.length), imageId, ar, cutout })
              } catch {
                alert(`${file.name} could not be read. Try JPG or PNG.`)
              }
            }
            if (!added.length) return
            setPalace(p => ({ ...p, locations: [...p.locations, ...added] }))
            setIndex(n)
          }}
          onExport={() => exportPalace(palace)}
          onImport={async file => {
            try {
              setPalace(upgradePalace(await importPalace(file)))
              setIndex(0)
              setMenuOpen(false)
            } catch (err) {
              alert(`Import failed: ${err.message}`)
            }
          }}
          onReset={() => ask({
            title: 'Reset palace',
            message: 'Resetting will reset ALL of the information inside of this palace. Are you sure you want to continue?',
            confirmLabel: 'Reset',
            countdown: 5,
          }, () => {
            const fresh = resetPalace(palace)
            // Drop photos only the old notes used (card photos, removed stops).
            const keep = new Set(imageIdsOf(fresh))
            imageIdsOf(palace).filter(id => !keep.has(id)).forEach(id => deleteImage(id))
            notesDirty.current = false
            setQuiz(null)
            setWalking(false)
            setEditing(false)
            setNotesOpen(false)
            setActivePinId(null)
            setEndCard(false)
            setPalace(fresh)
            setIndex(0)
            setMenuOpen(false)
          })}
          onClose={() => setMenuOpen(false)}
        />
      )}

      {appearanceOpen && (
        <AppearancePanel
          look={look}
          night={prefs.night}
          onChange={setLook}
          onPickSkyPhoto={async file => {
            try {
              const { blob } = await prepareImage(file)
              const id = uid()
              await putImage(id, blob)
              if (look.skyImageId) deleteImage(look.skyImageId)
              setLook({ sky: 'image', skyPicked: true, skyImageId: id })
            } catch {
              alert('That image could not be read. Try a JPG or PNG.')
            }
          }}
          signArt={signArt}
          onPickSignArt={async file => {
            try {
              const { blob, ar } = await prepareImage(file, 1600)
              const id = uid()
              await putImage(id, blob)
              if (look.signImageId) deleteImage(look.signImageId)
              setLook({ signImageId: id, signAr: ar })
            } catch {
              alert('That image could not be read. Try a JPG or PNG.')
            }
          }}
          onResetSignArt={() => {
            if (look.signImageId) deleteImage(look.signImageId)
            setLook({ signImageId: null, signAr: 1486 / 1791, signLayout: null, signText: 'light' })
          }}
          onPickCursor={async file => {
            try {
              setLook({ cursor: 'custom', cursorUrl: await cursorFromImage(file) })
            } catch {
              alert('That image could not be read. Try a PNG.')
            }
          }}
          onClose={() => setAppearanceOpen(false)}
        />
      )}

      {dialog && (
        <ConfirmDialog
          {...dialog}
          onConfirm={() => { const run = dialog.run; setDialog(null); run() }}
          onCancel={() => setDialog(null)}
        />
      )}

      {adding && (
        <AddLocationDialog
          campus={campusCatalog().filter(c => !locs.some(l => l.name === c.name || (c.builtin && l.builtin === c.builtin)))}
          imageFor={urlFor}
          onPickCampus={c => {
            setPalace(p => ({ ...p, locations: [...p.locations, c] }))
            setAdding(false)
            switchMode(null)
            setIndex(n)
          }}
          onClose={() => setAdding(false)}
          onCreate={(fields, file) => {
            const l = newLocation(fields, n)
            setPalace(p => ({ ...p, locations: [...p.locations, l] }))
            setAdding(false)
            switchMode(null)
            setIndex(n)
            if (file) setPhoto(l.id, file)
          }}
        />
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={e => { setPhoto(uploadTarget.current, e.target.files[0]); e.target.value = '' }}
      />
      {dragOver && !busy && !adding && !appearanceOpen && !menuOpen && <div className="drop-hint">Drop to set the photo for {cur.name}</div>}
    </main>
  )
}
