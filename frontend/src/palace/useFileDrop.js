import { useState } from 'react'

// Show a short message at the bottom of the screen (no React state needed).
export function notify(message) {
  const el = document.createElement('div')
  el.className = 'toast'
  el.setAttribute('role', 'status')
  el.textContent = message
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 5000)
}

// Images dragged from another web page arrive as a web address (or inline
// data) rather than a file. Pull those addresses out of the drop.
function imageUrlsFrom(dataTransfer) {
  const urls = []
  const html = dataTransfer.getData('text/html')
  if (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    doc.querySelectorAll('img[src]').forEach(img => urls.push(img.getAttribute('src')))
  }
  const list = dataTransfer.getData('text/uri-list') || dataTransfer.getData('text/plain')
  list.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#')).forEach(u => urls.push(u))
  return [...new Set(urls)].filter(u => /^(https?:|data:image\/)/.test(u))
}

async function download(url) {
  const res = await fetch(url, { mode: 'cors' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  if (!blob.type.startsWith('image/')) throw new Error('not an image')
  const name = decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() || 'web-image').slice(0, 60)
  return new File([blob], url.startsWith('data:') ? `web-image.${blob.type.split('/')[1]}` : name, { type: blob.type })
}

// Every image in a drop: real files first; otherwise images dragged in from the web.
// Call during the drop event (the browser clears the dragged data afterwards).
export function imagesFromDrop(dataTransfer) {
  const files = [...dataTransfer.files].filter(f => f.type.startsWith('image/'))
  if (files.length) return Promise.resolve(files)
  const urls = imageUrlsFrom(dataTransfer)
  if (!urls.length) return Promise.resolve([])
  return Promise.allSettled(urls.slice(0, 20).map(download)).then(results => {
    const got = results.filter(r => r.status === 'fulfilled').map(r => r.value)
    if (!got.length) {
      const notImages = results.every(r => r.reason?.message === 'not an image')
      notify(notImages
        ? "That link isn't an image. Try dragging the picture itself."
        : "That website doesn't let other sites copy its images. Save the image to your computer first, then drop the saved file.")
    }
    return got
  })
}

// Drag-and-drop for image pickers. Spread `props` onto the drop area and use
// `over` to highlight it. Drops are stopped here, so the scene's own
// "drop a photo for this stop" doesn't also fire.
export function useFileDrop(onFiles, { multiple = false } = {}) {
  const [over, setOver] = useState(false)
  const stop = e => {
    e.preventDefault()
    e.stopPropagation()
  }
  return {
    over,
    props: {
      'data-dropzone': '',
      onDragEnter: e => { stop(e); setOver(true) },
      onDragOver: e => {
        stop(e)
        e.dataTransfer.dropEffect = 'copy'
        if (!over) setOver(true)
      },
      onDragLeave: e => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOver(false)
      },
      onDrop: e => {
        stop(e)
        setOver(false)
        imagesFromDrop(e.dataTransfer).then(images => {
          if (images.length) onFiles(multiple ? images : images.slice(0, 1))
        })
      },
    },
  }
}
