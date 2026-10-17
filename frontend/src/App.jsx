import { useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import PalaceApp from './palace/PalaceApp.jsx'
import Sky from './palace/components/Sky.jsx'
import signUrl from './palace/assets/sign.webp'

function App() {
  const {
    isLoading,
    isAuthenticated,
    error,
    loginWithRedirect: login,
    logout: auth0Logout,
    user,
  } = useAuth0()
  const [guest, setGuest] = useState(false)

  const signup = () =>
    login({ authorizationParams: { screen_hint: 'signup' } })

  const logout = () =>
    auth0Logout({ logoutParams: { returnTo: window.location.origin } })

  if (isLoading) {
    return (
      <main className="landing">
        <Sky />
        <p className="landing-loading">Loading…</p>
      </main>
    )
  }

  if (isAuthenticated) return <PalaceApp account={{ user, logout }} />
  if (guest) return <PalaceApp account={{ guest: true, login, exit: () => setGuest(false) }} />

  return (
    <main className="landing">
      <Sky />
      <div className="landing-content">
        <div className="sign landing-sign">
          <img src={signUrl} alt="" />
          <h1 className="sign-name is-long">UF Memory Palace</h1>
          <div className="sign-topic">
            <p className="sign-subject is-long">Walk through campus and learn the method of loci</p>
          </div>
        </div>
        <section className="landing-card">
          <p className="eyebrow">SwampHacks 2026</p>
          <h2>Turn your notes into a walk across UF.</h2>
          <p className="muted">
            The method of loci is a memory trick: put each idea somewhere you know, then
            walk past it in your mind. Here every concept lives at a UF landmark. Walk the
            route to learn it, then quiz yourself both ways: what's at each stop, and where
            you put each idea.
          </p>
          {error && <p className="error">Error: {error.message}</p>}
          <div className="row landing-actions">
            <button className="btn" onClick={() => login()}>Log in</button>
            <button className="btn btn-ghost" onClick={signup}>Sign up</button>
          </div>
          <button className="link" onClick={() => setGuest(true)}>
            or try the sample palace without an account
          </button>
        </section>
      </div>
    </main>
  )
}

export default App
