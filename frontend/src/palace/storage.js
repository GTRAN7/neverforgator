import { useEffect, useState } from 'react'

// Until the backend exists, palaces live in this browser. Each signed-in user
// gets their own slot (keyed by Auth0 `sub`); the sample/guest palace uses the base key.
const BASE_KEY = 'uf-mind-palace:v2'
export const storageKey = sub => (sub ? `${BASE_KEY}:${sub}` : BASE_KEY)

export function loadPalace(key = BASE_KEY) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function savePalace(palace, key = BASE_KEY) {
  try {
    localStorage.setItem(key, JSON.stringify(palace))
  } catch {
    /* storage full or blocked — keep working in memory */
  }
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

// Every uploaded photo in a palace: stop photos and card photos.
export const imageIdsOf = palace =>
  palace.locations.flatMap(l => [l.imageId, ...l.pins.map(p => p.imageId)]).filter(Boolean)

// Object URLs for the given IndexedDB image ids, loaded as they appear.
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
