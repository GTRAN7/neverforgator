import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import PalaceApp from './palace/PalaceApp.jsx'
import Dashboard from './palace/components/Dashboard.jsx'
import { loadPalace } from './palace/storage'
import { useApi } from './palace/api'
import { useNightMode } from './palace/night'
import Settings from './palace/components/Settings.jsx'
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
  const api = useApi()
  // The first request from a new account creates its row on the server.
  useEffect(() => {
    if (!isAuthenticated) return
    api('/me').catch(e => console.warn('Account not reached on the server:', e.message))
  }, [isAuthenticated, api])
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
        <p className="landing-loading">Loading…</p>
      </main>
    )
  }

  if (isAuthenticated || guest) {
    const account = isAuthenticated
      ? { user, logout, api }
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
      <Settings prefs={prefs} className="landing-corner" />
      <div className="landing-content">
        <div className="sign landing-sign">
          <img src={signUrl} alt="" />
          <h1 className="sign-name is-long">Never Forgator</h1>
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
