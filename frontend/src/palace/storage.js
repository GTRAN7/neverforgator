import { useEffect, useState } from 'react'
import { uid } from './seed'

// Until the backend exists, palaces live in this browser. Each account (Auth0
// `sub`, or the guest) has a library listing its palaces; each palace is stored
// under its own key. Swap these functions for API calls when the backend lands.
const BASE_KEY = 'uf-mind-palace:v2'
const accountKey = sub => (sub ? `${BASE_KEY}:${sub}` : BASE_KEY) // also where v1 kept its single palace
const libraryKey = sub => `${accountKey(sub)}:library`
const palaceKey = (sub, id) => `${accountKey(sub)}:palace:${id}`

function read(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or blocked — keep working in memory */
  }
}

const summary = (id, palace, prev) => ({
  id,
  title: palace.title || 'My UF palace',
  stops: palace.locations.length,
  cards: palace.locations.reduce((n, l) => n + l.pins.length, 0),
  createdAt: prev?.createdAt ?? Date.now(),
  updatedAt: Date.now(),
})

function readLibrary(sub) {
  let library = read(libraryKey(sub))
  if (!library) {
    // First run with a library: keep the palace an earlier version saved.
    library = { palaces: [] }
    const legacy = read(accountKey(sub))
    if (legacy?.locations) {
      const id = uid()
      write(palaceKey(sub, id), legacy)
      library.palaces.push(summary(id, legacy))
    }
    write(libraryKey(sub), library)
  }
  return library
}

export const listPalaces = sub =>
  [...readLibrary(sub).palaces].sort((a, b) => b.updatedAt - a.updatedAt)

export const loadPalace = (sub, id) => read(palaceKey(sub, id))

export function savePalace(sub, id, palace) {
  write(palaceKey(sub, id), palace)
  const library = readLibrary(sub)
  const prev = library.palaces.find(p => p.id === id)
  library.palaces = [...library.palaces.filter(p => p.id !== id), summary(id, palace, prev)]
  write(libraryKey(sub), library)
}

export function createPalace(sub, palace) {
  const id = uid()
  savePalace(sub, id, palace)
  return id
}

export function deletePalace(sub, id) {
  const palace = loadPalace(sub, id)
  if (palace) imageIdsOf(palace).forEach(imageId => deleteImage(imageId))
  try {
    localStorage.removeItem(palaceKey(sub, id))
  } catch {
    /* ignore */
  }
  const library = readLibrary(sub)
  library.palaces = library.palaces.filter(p => p.id !== id)
  write(libraryKey(sub), library)
}

// Photos are too big for localStorage, so they live in IndexedDB as Blobs.
let dbPromise
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('uf-mind-palace', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('images')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx(mode, fn) {
  return db().then(d => new Promise((resolve, reject) => {
    const t = d.transaction('images', mode)
    const req = fn(t.objectStore('images'))
    t.oncomplete = () => resolve(req?.result)
    t.onerror = () => reject(t.error)
  }))
}

export const putImage = (id, blob) => tx('readwrite', s => s.put(blob, id))
export const getImage = id => tx('readonly', s => s.get(id))
export const deleteImage = id => tx('readwrite', s => s.delete(id))

// Downscale big phone photos so storage stays small and transitions stay smooth.
// Images with a transparent background are kept as cutouts (WebP/PNG keep alpha).
export async function prepareImage(file, max = 2400) {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale)
  const h = Math.round(bmp.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bmp, 0, 0, w, h)
  const cutout = hasTransparency(ctx, w, h)
  const blob = await new Promise(r => canvas.toBlob(r, cutout ? 'image/webp' : 'image/jpeg', 0.88))
  return { blob, ar: w / h, cutout }
}

function hasTransparency(ctx, w, h) {
  const { data } = ctx.getImageData(0, 0, w, h)
  let clear = 0
  for (let i = 3; i < data.length; i += 4 * 97) if (data[i] < 200) clear++
  return clear / (data.length / (4 * 97)) > 0.02
}

// Every uploaded photo in a palace: background, stop photos and card photos.
export const imageIdsOf = palace => [
  palace.appearance?.skyImageId,
  palace.appearance?.signImageId,
  ...palace.locations.flatMap(l => [l.imageId, ...l.pins.map(p => p.imageId)]),
].filter(Boolean)

// Object URLs for the given IndexedDB image ids, loaded as they appear.
// Shrink an image to a small PNG data URL, for use as a mouse cursor.
export async function cursorFromImage(file, size = 32) {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(size / bmp.width, size / bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const w = bmp.width * scale
  const h = bmp.height * scale
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h)
  return canvas.toDataURL('image/png')
}

export function useImageUrls(imageIds) {
  const [urls, setUrls] = useState({})
  const ids = imageIds.join(',')
  useEffect(() => {
    let cancelled = false
    for (const id of ids ? ids.split(',') : []) {
      if (urls[id]) continue
      getImage(id).then(blob => {
        if (blob && !cancelled) setUrls(u => (u[id] ? u : { ...u, [id]: URL.createObjectURL(blob) }))
      })
    }
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])
  return urls
}

const toDataUrl = blob => new Promise(resolve => {
  const r = new FileReader()
  r.onload = () => resolve(r.result)
  r.readAsDataURL(blob)
})

export async function exportPalace(palace) {
  const images = {}
  for (const id of imageIdsOf(palace)) {
    const blob = await getImage(id)
    if (blob) images[id] = await toDataUrl(blob)
  }
  const file = new Blob([JSON.stringify({ ...palace, images })], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(file)
  a.download = 'uf-mind-palace.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export async function importPalace(file) {
  const data = JSON.parse(await file.text())
  if (!Array.isArray(data.locations)) throw new Error('Not a mind palace file')
  for (const [id, url] of Object.entries(data.images ?? {})) {
    await putImage(id, await (await fetch(url)).blob())
  }
  delete data.images
  return data
}
