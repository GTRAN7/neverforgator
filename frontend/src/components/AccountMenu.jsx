import { useEffect, useRef, useState } from 'react';

// The avatar in the header: who you're signed in as, the tour and log out.
// Settings live behind the gear next to it (SettingsMenu.jsx), like in campus mode.
export default function AccountMenu({ account }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const user = account?.user;

  // Click anywhere else (or Escape) closes the menu.
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [open]);

  // Auth0's "name" is often just an email or a single letter; the nickname (email prefix) reads better then.
  const fullName = user?.name && user.name.length > 1 && !user.name.includes('@') ? user.name : user?.nickname;
  const name = user?.given_name || fullName?.split(/[\s@._]/)[0] || 'You';
  const initial = name[0]?.toUpperCase() ?? '?';
  // Gravatar's default is a grey blank; our gator-green initial looks better.
  const [photoFailed, setPhotoFailed] = useState(false);
  const photo = user?.picture && !user.picture.includes('gravatar.com') && !photoFailed ? user.picture : null;

  return (
    <div className="account-menu" ref={box}>
      <button className="account-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {photo
          ? <img src={photo} alt="" referrerPolicy="no-referrer" onError={() => setPhotoFailed(true)} />
          : <span className="avatar">{initial}</span>}
        <span className="account-name">{name}</span>
        <span className="chev" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="card-menu account-dropdown" role="menu">
          <div className="account-who">
            <strong>{fullName ?? 'Local user'}</strong>
            {user?.email && <span>{user.email}</span>}
          </div>
          <button role="menuitem" onClick={() => { setOpen(false); window.location.hash = '#/'; }}>Dashboard</button>
          <button role="menuitem" onClick={() => { setOpen(false); window.location.hash = '#/guide'; }}>Take the tour again</button>
          {account && <button role="menuitem" className="danger" onClick={account.logout}>Log out</button>}
        </div>
      )}
    </div>
  );
}
