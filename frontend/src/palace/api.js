import { useAuth0 } from '@auth0/auth0-react'
import { useCallback } from 'react'

// Talks to the FastAPI backend (backend/, http://localhost:8000 locally).
// Palaces are still edited and saved in this browser (storage.js); the account
// keeps copies, because the backend can't update a saved palace yet.
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')
const AUDIENCE = import.meta.env.VITE_AUTH0_AUDIENCE

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

// A request function for the signed-in user: sends their Auth0 access token.
// With DEV_AUTH=true in backend/.env the server skips Auth0 and trusts the
// X-Dev-User header instead, so local testing works without a token.
export function useApi() {
  const { getAccessTokenSilently, user } = useAuth0()
  return useCallback(async (path, { method = 'GET', body } = {}) => {
    const headers = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (import.meta.env.DEV && user?.sub) headers['X-Dev-User'] = user.sub
    if (AUDIENCE) {
      try {
        headers.Authorization = `Bearer ${await getAccessTokenSilently({ authorizationParams: { audience: AUDIENCE } })}`
      } catch (e) {
        // Fine locally (DEV_AUTH); a deployed backend will answer 401.
        console.warn('No API access token:', e.message)
      }
    }
    let res
    try {
      res = await fetch(`${API_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    } catch {
      throw new ApiError("Couldn't reach the server. Is the backend running?", 0)
    }
    if (!res.ok) {
      const detail = await res.json().then(j => j.detail, () => null)
      const message = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map(d => d.msg).join('; ') : `Server error ${res.status}`
      throw new ApiError(message, res.status)
    }
    return res.status === 204 ? null : res.json()
  }, [getAccessTokenSilently, user?.sub])
}
