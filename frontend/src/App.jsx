import { useAuth0 } from '@auth0/auth0-react'
import './App.css'

function App() {
  const {
    isLoading,
    isAuthenticated,
    error,
    loginWithRedirect: login,
    logout: auth0Logout,
    user,
  } = useAuth0()

  const signup = () =>
    login({ authorizationParams: { screen_hint: 'signup' } })

  const logout = () =>
    auth0Logout({ logoutParams: { returnTo: window.location.origin } })

  if (isLoading) return <main className="card">Loading...</main>

  return (
    <main className="card">
      <h1>SwampHacks Project</h1>

      {isAuthenticated ? (
        <>
          {user.picture && (
            <img className="avatar" src={user.picture} alt={user.name} />
          )}
          <p>
            Welcome, <strong>{user.name}</strong>
          </p>
          <p className="muted">{user.email}</p>
          <button onClick={logout}>Log out</button>
        </>
      ) : (
        <>
          <p className="muted">Sign in to get started.</p>
          {error && <p className="error">Error: {error.message}</p>}
          <div className="actions">
            <button onClick={() => login()}>Log in</button>
            <button className="secondary" onClick={signup}>
              Sign up
            </button>
          </div>
        </>
      )}
    </main>
  )
}

export default App
