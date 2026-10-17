import { useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import PalaceApp from './palace/PalaceApp.jsx'
import Dashboard from './palace/components/Dashboard.jsx'
import { loadPalace } from './palace/storage'
import { useNightMode } from './palace/night'
import NightToggle from './palace/components/NightToggle.jsx'
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
  const [night, toggleNight] = useNightMode()
  // The open palace lives in the URL (#<palaceId>/<stop>) so a refresh stays put.
  const [openId, setOpenId] = useState(() => location.hash.slice(1).split('/')[0] || null)

  const signup = () =>
    login({ authorizationParams: { screen_hint: 'signup' } })

  const logout = () =>
    auth0Logout({ logoutParams: { returnTo: window.location.origin } })

  if (isLoading) {
    return (
      <main className="landing">
        <Sky night={night} />
        <p className="landing-loading">Loading…</p>
      </main>
    )
  }

  if (isAuthenticated || guest) {
    const account = isAuthenticated
      ? { user, logout }
      : { guest: true, login, exit: () => { setGuest(false); setOpenId(null) } }
    const sub = account.user?.sub
    if (openId && loadPalace(sub, openId)) {
      const exit = () => {
        history.replaceState(null, '', location.pathname)
        setOpenId(null)
      }
      return <PalaceApp key={openId} account={account} palaceId={openId} onExit={exit} night={night} onToggleNight={toggleNight} />
    }
    return <Dashboard account={account} onOpen={setOpenId} night={night} onToggleNight={toggleNight} />
  }

  return (
    <main className="landing">
      <Sky night={night} />
      <NightToggle night={night} onToggle={toggleNight} className="landing-corner" />
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
            or try it without an account
          </button>
        </section>
      </div>
    </main>
  )
}

export default App
