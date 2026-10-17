import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAccount } from '../lib/account.js';
import Creature from './Creature.jsx';

const open = (id) => { window.location.hash = `#/palace/${id}`; };

export default function PalaceList() {
  const account = useAccount();
  const [palaces, setPalaces] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(null); // template being copied

  useEffect(() => {
    api.listPalaces().then(setPalaces).catch((e) => setError(e.message));
  }, []);

  const templates = palaces?.filter((p) => p.template) ?? [];
  const mine = palaces?.filter((p) => p.mine && !p.template) ?? [];

  async function handleCreate(event) {
    event.preventDefault();
    try {
      open((await api.createPalace(name)).id);
    } catch (e) {
      setError(e.message);
    }
  }

  async function startFrom(template) {
    setStarting(template.id);
    try {
      open((await api.copyPalace(template.id)).id);
    } catch (e) {
      setError(e.message);
      setStarting(null);
    }
  }

  return (
    <div className="home">
      <div className="account">
        <a className="link" href="#/about">How it works</a>
        {account && (
          <>
          {account.user.picture && <img src={account.user.picture} alt="" />}
          <span>{account.user.name}</span>
          <button className="link" onClick={account.logout}>Log out</button>
          </>
        )}
      </div>

      <div className="home-hero">
        <div className="hero-friends" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((n) => <Creature key={n} number={n} size="md" />)}
        </div>
        <h1 className="wordmark huge">Mind Palace</h1>
        <p className="scrawl tagline">your notes, living as little friends around UF campus</p>
      </div>

      {templates.length > 0 && (
        <section className="home-section">
          <h2 className="card-title">Walk a campus route</h2>
          <p className="scrawl subtitle">the stops are ready, just bring your notes</p>
          <ul className="palace-list">
            {templates.map((t, i) => (
              <li key={t.id}>
                <div className="template-card">
                  <Creature number={i + 1} size="md" />
                  <div className="template-text">
                    <strong>{t.name}</strong>
                    <span>{t.spotCount} stop{t.spotCount === 1 ? '' : 's'} · {t.roomCount} place{t.roomCount === 1 ? '' : 's'}</span>
                  </div>
                  {t.mine && <a className="link" href={`#/palace/${t.id}`}>edit route</a>}
                  <button className="btn accent" disabled={starting === t.id} onClick={() => startFrom(t)}>
                    {starting === t.id ? 'Setting up…' : 'Start here'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form className="create-card" onSubmit={handleCreate}>
        <label htmlFor="palace-name" className="field-label">
          {templates.length ? '…or build one in your own room' : 'Start a new palace'}
        </label>
        <div className="create-row">
          <input id="palace-name" className="pill-input" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. my dorm room" />
          <button className="btn accent" type="submit">Build it</button>
        </div>
      </form>
      {error && <p className="error-text">{error}</p>}

      {mine.length > 0 && (
        <section className="home-section">
          <h2 className="card-title">Your palaces</h2>
          <ul className="palace-list">
            {mine.map((p, i) => (
              <li key={p.id}>
                <a href={`#/palace/${p.id}`}>
                  <Creature number={i + 1} />
                  <strong>{p.name}</strong>
                  <span>{p.roomCount} room{p.roomCount === 1 ? '' : 's'} · {p.spotCount} friend{p.spotCount === 1 ? '' : 's'}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
