// AI helpers. Gemini runs on the backend only (the key never reaches the browser),
// so this calls the API through Vite's /api proxy (see vite.config.js).
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
    throw new Error("Couldn't reach the AI service. Is the backend running on port 3001?")
  }
  const body = await res.json().catch(() => ({}))
  if (res.status === 404 || (res.status >= 500 && !body.error)) {
    throw new Error('AI descriptions need the backend: start it on port 3001 with the /api/describe route.')
  }
  if (!res.ok) throw new Error(body.error || `AI request failed (${res.status})`)
  return body.description
}
