import { useEffect, useState } from 'react'
// Fonts are bundled locally so the demo never depends on Google Fonts loading.
import '@fontsource/fredoka/500.css'
import '@fontsource/fredoka/600.css'
import '@fontsource/fredoka/700.css'
import '@fontsource/nunito/400.css'
import '@fontsource/nunito/600.css'
import '@fontsource/nunito/800.css'
import '@fontsource/caveat/600.css'
import './index.css'
import { useAuth0 } from '@auth0/auth0-react'
import { setTokenGetter } from './api.js'
import PalaceList from './components/PalaceList.jsx'
import PalaceEditor from './components/PalaceEditor.jsx'
import Landing from './components/Landing.jsx'
import Guide from './components/Guide.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { AccountContext } from './lib/account.js'
import { startInBuiltIn, openSample } from './lib/start.js'

// Tiny hash router. Using the URL hash means a page reload keeps you where you were.
//   #/palace/<id>[/feed|/wander] → that palace (optionally opening the notes box or Wander)
//   #/guide → the onboarding tour    #/about → the landing page    else → the list
const readRoute = () => window.location.hash
const home = () => { window.location.hash = '#/' }

function Pages() {
  const [route, setRoute] = useState(readRoute)

  useEffect(() => {
    const onChange = () => setRoute(readRoute())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const [, palaceId, action] = route.match(/^#\/palace\/([a-f0-9]+)(?:\/(\w+))?/) ?? []
  if (palaceId) return <PalaceEditor key={palaceId} palaceId={palaceId} startAction={action} />
  if (route === '#/guide') {
    return <Guide onStart={() => startInBuiltIn()} onSample={() => openSample()} onClose={home} />
  }
  if (route === '#/about') return <Landing onLogin={home} onSignup={home} onTour={() => { window.location.hash = '#/guide' }} />
  return <PalaceList />
}

// When the backend rejects the login (see api.js), say so clearly instead of failing silently.
// The usual cause on a new machine: frontend/.env.local is missing VITE_AUTH0_AUDIENCE, so Auth0
// hands out tokens that aren't meant for our API.
function LoginExpired({ onLogin }) {
  const [reason, setReason] = useState(null)
  useEffect(() => {
    const show = (e) => setReason(e.detail || 'Your login was rejected')
    window.addEventListener('login-failed', show)
    return () => window.removeEventListener('login-failed', show)
  }, [])
  if (!reason) return null
  const noAudience = !import.meta.env.VITE_AUTH0_AUDIENCE
  return (
    <div className="modal-backdrop">
      <div className="prefs-card login-expired" role="alertdialog" aria-label="Log in again">
        <h2 className="card-title big">Your login needs a refresh</h2>
        {noAudience ? (
          <p>This copy of the app isn’t set up for the backend yet. Add this line to <code>frontend/.env.local</code>,
            restart <code>npm run dev</code>, then log in again:<br /><code>VITE_AUTH0_AUDIENCE=https://loci-api</code></p>
        ) : (
          <p>The server didn’t accept your login (it may have expired). Log in again and you’ll be right back.</p>
        )}
        <small className="hint-text">Server said: {reason}</small>
        <div className="btn-row">
          <button className="btn ghost" onClick={() => setReason(null)}>Not now</button>
          <button className="btn accent" onClick={onLogin}>Log in again</button>
        </div>
      </div>
    </div>
  )
}

// Shows the landing page (log in / sign up) until Auth0 says we're signed in, then the app.
function AuthGate() {
  const { isLoading, isAuthenticated, error, user, loginWithRedirect, logout, getAccessTokenSilently } = useAuth0()

  if (isLoading) return <div className="center">Loading…</div>
  if (!isAuthenticated) {
    const signup = () => loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } })
    // The tour works before signing up too (the last step asks you to make an account).
    if (window.location.hash === '#/guide') {
      return <Guide onSignup={signup} onClose={() => { window.location.hash = '#/'; window.location.reload() }} />
    }
    return (
      <Landing
        onTour={() => { window.location.hash = '#/guide'; window.location.reload() }}
        error={error}
        onLogin={() => loginWithRedirect()}
        onSignup={signup}
      />
    )
  }

  // Every API call sends the user's access token; the backend checks it.
  // (Set during render so it's ready before the pages' first requests.)
  setTokenGetter((options) => getAccessTokenSilently(options))
  const account = {
    user,
    logout: () => logout({ logoutParams: { returnTo: window.location.origin } }),
  }
  return (
    <AccountContext.Provider value={account}>
      <Pages />
      <LoginExpired onLogin={() => loginWithRedirect()} />
    </AccountContext.Provider>
  )
}

export default function App({ authDisabled }) {
  return <ErrorBoundary>{authDisabled ? <Pages /> : <AuthGate />}</ErrorBoundary>
}
