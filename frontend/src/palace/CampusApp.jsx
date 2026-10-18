import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import './palace.css'
import PalaceApp from './PalaceApp.jsx'
import Dashboard from './components/Dashboard.jsx'
import { loadPalace } from './storage'
import { useNightMode } from './night'
import Settings from './components/Settings.jsx'
import Sky from './components/Sky.jsx'
import StudioButton from './components/StudioButton.jsx'
import signUrl from './assets/sign.webp'

// Campus mode (Natasha's app): the UF campus walk with photo signs, pins and a dashboard.
// It runs as its own mode for now (index.html?mode=campus); see src/main.jsx.
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
  // Display preferences shared by every page's Settings panel.
  const prefs = { night, toggleNight }

  // A file dropped anywhere that isn't a drop area would make the browser
  // open the image and leave the app; ignore those drops instead.
  useEffect(() => {
    const ignore = e => e.preventDefault()
    addEventListener('dragover', ignore)
    addEventListener('drop', ignore)
    return () => {
      removeEventListener('dragover', ignore)
      removeEventListener('drop', ignore)
    }
  }, [])
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
        <p className="landing-loading loading-state">
          <span>Loading</span>
          <span className="loading-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </p>
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
      return <PalaceApp key={openId} account={account} palaceId={openId} onExit={exit} prefs={prefs} />
    }
    return <Dashboard account={account} onOpen={setOpenId} prefs={prefs} />
  }

  return (
    <main className="landing">
      <Sky night={night} castle />
      <div className="landing-corner">
        <StudioButton />
        <Settings prefs={prefs} />
      </div>
      <div className="landing-content">
        <div className="sign landing-sign">
          <img src={signUrl} alt="" />
          <h1 className="sign-name is-long">NeverForgator</h1>
          <div className="sign-topic">
            <p className="sign-subject is-long">Walk through campus and learn the method of loci</p>
          </div>
        </div>
        <section className="landing-card">
          <p className="eyebrow">NeverForgator (2D) · SwampHacks 2026</p>
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
