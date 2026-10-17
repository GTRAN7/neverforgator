import { useEffect, useState } from 'react';
import { api, fileUrl } from '../api.js';
import { useAccount } from '../lib/account.js';
import { firstBuiltIn, openPalace, startInBuiltIn, openSample } from '../lib/start.js';
import { switchMode } from '../lib/mode.js';
import Creature, { Sparkle } from './Creature.jsx';
import Logo from './Logo.jsx';
import SkyPage from './SkyPage.jsx';
import SettingsMenu from './SettingsMenu.jsx';
import AccountMenu from './AccountMenu.jsx';
import { TOUR_DONE_KEY } from './Guide.jsx';

// Home: the built-in Reitz route (start memorizing right away), other campus routes,
// your own place, and the palaces you've made.
function PalaceListContent() {
  const account = useAccount();
  const [palaces, setPalaces] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null); // what's being set up
  // Renaming and deleting happen in the palace's row, not in window.prompt/confirm pop-ups:
  // browsers can silently block those (they answer "no" without showing anything).
  const [renaming, setRenaming] = useState(null); // { id, name } while a name is being edited
  const [deletingId, setDeletingId] = useState(null); // this palace's row asks "Delete?"

  useEffect(() => {
    // First visit ever: take the tour first.
    let toured = true;
    try { toured = Boolean(localStorage.getItem(TOUR_DONE_KEY)); } catch { /* no storage: skip the tour */ }
    if (!toured) {
      window.location.hash = '#/guide';
      return;
    }
    api.listPalaces().then(setPalaces).catch((e) => setError(e.message));
  }, []);

  // The first built-in route (the Reitz) leads; other shared routes (the UF campus walk...) follow.
  const builtIn = firstBuiltIn(palaces ?? []);
  const sample = palaces?.find((p) => p.sample);
  const routes = palaces?.filter((p) => p.template && !p.sample && p !== builtIn) ?? [];
  const mine = palaces?.filter((p) => p.mine && !p.template) ?? [];

  async function run(what, action) {
    setBusy(what);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e.message);
      setBusy(null);
    }
  }

  function handleCreate(event) {
    event.preventDefault();
    run('create', async () => openPalace((await api.createPalace(name)).id));
  }

  function rename(palace, name) {
    setRenaming(null);
    const next = name.trim();
    if (!next || next === palace.name) return;
    run(null, async () => {
      await api.renamePalace(palace.id, next);
      setPalaces((list) => list.map((p) => (p.id === palace.id ? { ...p, name: next } : p)));
      setBusy(null);
    });
  }

  function remove(palace) {
    setDeletingId(null);
    run(null, async () => {
      await api.deletePalace(palace.id);
      setPalaces((list) => list.filter((p) => p.id !== palace.id));
      setBusy(null);
    });
  }

  return (
    <div className="home">
      <header className="home-nav">
        <Logo />
        <div className="nav-actions">
          <button className="nav-pill" onClick={() => switchMode('campus')} title="Natasha's campus walk, a second mode for now">
            <span aria-hidden="true">🏛</span> 2D Mode
          </button>
          <a className="nav-pill" href="#/guide"><span aria-hidden="true">?</span> How It Works</a>
          <SettingsMenu />
          <AccountMenu account={account} />
        </div>
      </header>

      <div className="home-hero">
        <h1 className="landing-title">What do you want to never forget?</h1>
        <p className="scrawl tagline">pick a place, feed it your notes, walk it in your head</p>
      </div>

      {builtIn && (
        <section className="builtin-card">
          <div className="builtin-photo" style={builtIn.cover ? { backgroundImage: `url(${fileUrl(builtIn.id, builtIn.cover)})` } : undefined}>
            <span className="chip yellow">Built in · ready to go</span>
          </div>
          <div className="builtin-text">
            <h2 className="card-title big">{builtIn.name}</h2>
            <p>Already scanned, with {builtIn.spotCount} stops ready (more get found as your notes need them). No photos
              needed: paste your notes and start memorizing in under a minute.</p>
            <div className="btn-row">
              <button className="btn accent" disabled={Boolean(busy)} onClick={() => run('builtin', () => startInBuiltIn(palaces))}>
                <Sparkle /> {busy === 'builtin' ? 'Setting up…' : 'Start memorizing here'}
              </button>
              {sample && (
                <button className="btn ghost" disabled={Boolean(busy)} onClick={() => run('sample', () => openSample(palaces))}>
                  See a finished example
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {routes.length > 0 && (
        <section className="home-section">
          <h2 className="section-tag">More routes</h2>
          <ul className="palace-list">
            {routes.map((t) => (
              <li key={t.id}>
                <div className="template-card">
                  <Creature number={t.id} size="md" />
                  <div className="template-text">
                    <strong>{t.name}</strong>
                    <span>{t.builtIn && 'built in · '}{t.spotCount} stop{t.spotCount === 1 ? '' : 's'} · {t.roomCount} place{t.roomCount === 1 ? '' : 's'}</span>
                  </div>
                  {t.mine && <a className="link" href={`#/palace/${t.id}`}>edit route</a>}
                  <button className="btn accent" disabled={Boolean(busy)}
                    onClick={() => run(t.id, async () => openPalace((await api.copyPalace(t.id)).id, 'feed'))}>
                    {busy === t.id ? 'Setting up…' : 'Start here'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form className="create-card" onSubmit={handleCreate}>
        <label htmlFor="palace-name" className="field-label">
          {builtIn ? 'Or use a place you know by heart (your room, your apartment…)' : 'Start a new palace in a place you know'}
        </label>
        <div className="create-row">
          <input id="palace-name" className="pill-input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. my dorm room" />
          <button className="btn ink" type="submit" disabled={Boolean(busy)}>Build it</button>
        </div>
        <span className="hint-text">You’ll add a 360° photo, a phone panorama, or a 3D scan of it.</span>
      </form>
      {error && <p className="error-text">{error}</p>}

      {mine.length > 0 && (
        <section className="home-section">
          <h2 className="section-tag">Your palaces</h2>
          <ul className="palace-list">
            {mine.map((p) => (
              <li key={p.id} className="palace-row">
                {renaming?.id === p.id ? (
                  <form className="palace-row-edit" onSubmit={(e) => { e.preventDefault(); rename(p, renaming.name); }}>
                    <Creature number={p.id} />
                    <input className="pill-input" autoFocus maxLength={80} value={renaming.name} aria-label="Palace name"
                      onChange={(e) => setRenaming({ id: p.id, name: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(null); }} />
                    <button className="btn ink small" type="submit">Save</button>
                    <button className="btn ghost small" type="button" onClick={() => setRenaming(null)}>Cancel</button>
                  </form>
                ) : deletingId === p.id ? (
                  <div className="palace-row-edit" role="alertdialog" aria-label={`Delete ${p.name}?`}>
                    <Creature number={p.id} state="sleepy" />
                    <span className="palace-row-ask">Delete <strong>{p.name}</strong>? Its rooms, stops and scenes are gone for good.</span>
                    <button className="btn small danger" autoFocus onClick={() => remove(p)}>Delete</button>
                    <button className="btn ghost small" onClick={() => setDeletingId(null)}>Keep</button>
                  </div>
                ) : (
                  <>
                    <a href={`#/palace/${p.id}`}>
                      <Creature number={p.id} />
                      <strong>{p.name}</strong>
                      <span>{p.roomCount} room{p.roomCount === 1 ? '' : 's'} · {p.friendCount} friend{p.friendCount === 1 ? '' : 's'}</span>
                      {p.friendCount > 0 && p.nextReviewAt && <ReviewChip at={p.nextReviewAt} />}
                    </a>
                    <details className="more-menu">
                      <summary aria-label={`More for ${p.name}`}>⋯</summary>
                      <div className="more-items">
                        <button onClick={() => { setDeletingId(null); setRenaming({ id: p.id, name: p.name }); }}>Rename</button>
                        <button className="danger" onClick={() => { setRenaming(null); setDeletingId(p.id); }}>Delete</button>
                      </div>
                    </details>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {palaces && !mine.length && (
        <p className="scrawl empty-home">your palaces will live here</p>
      )}
    </div>
  );
}

// Spaced review: is it time to walk this palace again?
function ReviewChip({ at }) {
  const days = (new Date(at) - Date.now()) / 86400000;
  if (days <= 0) return <span className="chip yellow tiny">review due</span>;
  return <span className="chip tiny">review in {days < 1 ? `${Math.max(1, Math.round(days * 24))}h` : `${Math.round(days)}d`}</span>;
}

// The page sits in front of campus mode's sky (with the castle: your memory palace).
export default function PalaceList(props) {
  return (
    <SkyPage castle>
      <PalaceListContent {...props} />
    </SkyPage>
  );
}
