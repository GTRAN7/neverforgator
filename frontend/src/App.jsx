import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { setTokenGetter } from './api.js'
import PalaceList from './components/PalaceList.jsx'
import PalaceEditor from './components/PalaceEditor.jsx'
import Landing from './components/Landing.jsx'
import { AccountContext } from './lib/account.js'

// Tiny hash router. Using the URL hash means a page reload keeps you where you were.
//   #/palace/<id> → that palace    #/about → the landing page ("how it works")    else → the list
const readRoute = () => window.location.hash

function Pages() {
  const [route, setRoute] = useState(readRoute)

  useEffect(() => {
    const onChange = () => setRoute(readRoute())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const palaceId = route.match(/^#\/palace\/([a-f0-9]+)/)?.[1]
  if (palaceId) return <PalaceEditor key={palaceId} palaceId={palaceId} />
  if (route === '#/about') {
    const home = () => { window.location.hash = '#/' }
    return <Landing onLogin={home} onSignup={home} />
  }
  return <PalaceList />
}

// Shows the landing page (log in / sign up) until Auth0 says we're signed in, then the app.
function AuthGate() {
  const { isLoading, isAuthenticated, error, user, loginWithRedirect, logout, getAccessTokenSilently } = useAuth0()

  if (isLoading) return <div className="center">Loading…</div>
  if (!isAuthenticated) {
    return (
      <Landing
        error={error}
        onLogin={() => loginWithRedirect()}
        onSignup={() => loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } })}
      />
    )
  }

  // Every API call sends the user's access token; the backend checks it.
  // (Set during render so it's ready before the pages' first requests.)
  setTokenGetter(() => getAccessTokenSilently())
  const account = {
    user,
    logout: () => logout({ logoutParams: { returnTo: window.location.origin } }),
  }
  return (
    <AccountContext.Provider value={account}>
      <Pages />
    </AccountContext.Provider>
  )
}

export default function App({ authDisabled }) {
  return authDisabled ? <Pages /> : <AuthGate />
}
