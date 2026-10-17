// Full-screen route map, like Blueprint's hamburger menu.
export default function MenuOverlay({ locations, index, account, onGo, onMove, onAdd, onExport, onImport, onReset, onClose }) {
  return (
    <div className="menu" role="dialog" aria-label="Palace map">
      <button className="icon-btn menu-close" onClick={onClose} aria-label="Close menu">×</button>
      <div className="account">
        {account.user ? (
          <>
            {account.user.picture && <img className="avatar" src={account.user.picture} alt="" />}
            <span><b>{account.user.name}</b><br /><span className="muted">{account.user.email}</span></span>
            <button className="btn btn-small btn-ghost" onClick={account.logout}>Log out</button>
          </>
        ) : (
          <>
            <span className="muted">You're exploring the sample palace. Sign in to keep your own.</span>
            <button className="btn btn-small" onClick={() => account.login()}>Log in</button>
            <button className="btn btn-small btn-ghost" onClick={account.exit}>Exit</button>
          </>
        )}
      </div>
      <p className="eyebrow">Your route through campus</p>
      <ol className="menu-list">
        {locations.map((l, i) => (
          <li key={l.id} className={i === index ? 'is-current' : ''}>
            <button className="menu-go" onClick={() => onGo(i)}>
              <span className="menu-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="menu-name">{l.name}</span>
              <span className="menu-sub">{l.concept || l.subject} · {l.pins.length} cards</span>
            </button>
            <span className="menu-order">
              <button className="icon-btn" disabled={i === 0} onClick={() => onMove(i, -1)} aria-label="Move earlier">↑</button>
              <button className="icon-btn" disabled={i === locations.length - 1} onClick={() => onMove(i, 1)} aria-label="Move later">↓</button>
            </span>
          </li>
        ))}
      </ol>
      <div className="row menu-actions">
        <button className="btn" onClick={onAdd}>+ Add location</button>
        <button className="btn btn-ghost" onClick={onExport}>Export</button>
        <label className="btn btn-ghost">Import<input type="file" accept="application/json" hidden onChange={e => e.target.files[0] && onImport(e.target.files[0])} /></label>
        <button className="btn btn-ghost" onClick={onReset}>Reset sample</button>
      </div>
    </div>
  )
}
