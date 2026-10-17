import { useEffect, useRef, useState } from 'react'
import '@fontsource/fredoka/600.css'

// Who you are, in the header: the same avatar pill and drop-down as the 3D studio's
// (src/components/AccountMenu.jsx), so both modes look alike. Guests get Log in / Exit.

// Auth0's "name" is often just an email or a single letter; the nickname (email prefix) reads better then.
function names(user) {
  const full = user?.name && user.name.length > 1 && !user.name.includes('@') ? user.name : user?.nickname
  const first = user?.given_name || full?.split(/[\s@._]/)[0] || 'You'
  return { full, first }
}

// The round picture, or a gator-green initial (Gravatar's default is a grey blank).
export function Avatar({ user, large = false }) {
  const [failed, setFailed] = useState(false)
  const photo = user?.picture && !user.picture.includes('gravatar.com') && !failed ? user.picture : null
  const initial = user ? names(user).first[0].toUpperCase() : 'G'
  return photo
    ? <img className={`acct-avatar${large ? ' is-large' : ''}`} src={photo} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <span className={`acct-avatar${large ? ' is-large' : ''}`} aria-hidden="true">{initial}</span>
}

export default function AccountMenu({ account }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const user = account.user
  const { full, first } = names(user)

  // Click anywhere else (or Escape) closes the menu.
  useEffect(() => {
    if (!open) return
    const close = e => { if (!box.current?.contains(e.target)) setOpen(false) }
    const esc = e => e.key === 'Escape' && setOpen(false)
    addEventListener('pointerdown', close)
    addEventListener('keydown', esc)
    return () => { removeEventListener('pointerdown', close); removeEventListener('keydown', esc) }
  }, [open])

  return (
    <div className="acct-menu" ref={box}>
      <button className="acct-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Avatar user={user} />
        <span className="acct-name">{user ? first : 'Guest'}</span>
        <span className="acct-chev" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="acct-dropdown" role="menu">
          <div className="acct-who">
            <strong>{user ? full ?? 'Signed in' : 'Guest'}</strong>
            <span>{user ? user.email : 'Your palaces are saved in this browser'}</span>
          </div>
          {user ? (
            <button role="menuitem" className="is-danger" onClick={account.logout}>Log out</button>
          ) : (
            <>
              <button role="menuitem" onClick={() => account.login()}>Log in</button>
              <button role="menuitem" onClick={account.exit}>Exit</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
