import { useState } from 'react'
import { describe } from '../ai'

// "✨ Generate" button: asks the backend for a description and hands it to onResult.
export default function AIButton({ request, onResult, label = 'Generate' }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const run = async () => {
    const params = request()
    if (!params.text?.trim()) return setError('Type something first so the AI knows what to describe.')
    setBusy(true)
    setError(null)
    try {
      onResult(await describe(params))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="ai">
      <button type="button" className="btn btn-small btn-ai" onClick={run} disabled={busy}>
        {busy ? 'Writing…' : `✨ ${label}`}
      </button>
      {error && <span className="ai-error" role="alert">{error}</span>}
    </span>
  )
}
