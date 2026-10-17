// AI helpers. Gemini runs on the backend only (the key never reaches the browser),
// so this calls the FastAPI backend through Vite's /api proxy (see vite.config.js and
// POST /api/describe in backend/app/studio/router.py).
//
// Contract for the backend route:
//   POST /api/describe  { kind: 'subject' | 'term', text, subject?, place? }
//   → 200 { description: string }   (2–3 plain sentences)
//   kind 'subject': describe the subject/theme studied at `place`
//   kind 'term':    define the term `text`, in the context of `subject`

export async function describe({ kind, text, subject = '', place = '' }) {
  let res
  try {
    res = await fetch('/api/describe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, text, subject, place }),
    })
  } catch {
    throw new Error("Couldn't reach the AI service. Is the backend running (npm run dev, port 8000)?")
  }
  const body = await res.json().catch(() => ({}))
  if (res.status === 404 || (res.status >= 500 && !body.error && !body.detail)) {
    throw new Error('AI descriptions need the backend: start it with npm run dev (FastAPI, port 8000).')
  }
  if (!res.ok) throw new Error(body.error || body.detail || `AI request failed (${res.status})`)
  return body.description
}
