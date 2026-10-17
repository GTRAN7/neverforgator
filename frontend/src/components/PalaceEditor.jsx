import { useCallback, useEffect, useRef, useState } from 'react';
import { api, imageUrl } from '../api.js';
import { startInBuiltIn } from '../lib/start.js';
import { useImageQueue } from '../lib/useImageQueue.js';
import Viewer from './Viewer.jsx';
import RoomStrip from './RoomStrip.jsx';
import PathList from './PathList.jsx';
import WanderCard from './WanderCard.jsx';
import QuizCard from './QuizCard.jsx';
import FeedModal from './FeedModal.jsx';
import SpotCard from './SpotCard.jsx';
import Creature, { Sparkle } from './Creature.jsx';
import Logo from './Logo.jsx';
import AccountMenu from './AccountMenu.jsx';
import { useAccount } from '../lib/account.js';

const MODES = [
  { id: 'build', label: 'Build' },
  { id: 'wander', label: 'Wander' },
  { id: 'quiz', label: 'Quiz' },
];

const BUNTING = ['#F08A6C', '#7FA98B', '#FFD86B', '#8CCBFF', '#FF9EC4'];

// startAction (from the URL): 'feed' opens the notes box, 'wander' starts walking.
export default function PalaceEditor({ palaceId, startAction }) {
  const [palace, setPalace] = useState(null);
  const [mode, setMode] = useState(startAction === 'wander' ? 'wander' : 'build');
  const [roomId, setRoomId] = useState(null);
  const [focusId, setFocusId] = useState(null); // the spot the camera turns to
  const [selectedId, setSelectedId] = useState(null); // the highlighted spot
  const [inspecting, setInspecting] = useState(false); // Build: the selected spot's card is open
  const [movingId, setMovingId] = useState(null); // Build: the next click in the room moves this spot
  const [feeding, setFeeding] = useState(false); // "Fill from notes" modal open
  const [quizResults, setQuizResults] = useState(null); // { spotId: true/false } once a quiz starts
  const [friendPicker, setFriendPicker] = useState(null); // set while the quiz asks "where did you put X?"
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [mock, setMock] = useState(false);
  const account = useAccount();
  const [roomBanner, setRoomBanner] = useState(null); // "walking into Room 2" for a moment after changing rooms
  const lastRoom = useRef(null);

  // Changing rooms: show where you're walking to, so the route feels like one walk.
  useEffect(() => {
    if (lastRoom.current && roomId && lastRoom.current !== roomId) setRoomBanner(roomId);
    if (roomId) lastRoom.current = roomId;
  }, [roomId]);

  useEffect(() => {
    api.getPalace(palaceId).then((p) => {
      setPalace(p);
      if (startAction === 'feed' && !p.readOnly) setFeeding(true);
      if (p.sample) setMode('wander'); // the finished example opens walking
      if (startAction) window.history.replaceState(null, '', `#/palace/${palaceId}`); // a reload shouldn't reopen it
    }).catch((e) => setError(e.message));
    api.status().then((s) => { setMock(s.mock); }).catch(() => {});
  }, [palaceId]);

  // Replace one spot in state (used when the server returns a single updated spot).
  const updateSpot = useCallback((spot) =>
    setPalace((p) => ({ ...p, spots: p.spots.map((s) => (s.id === spot.id ? spot : s)) })), []);

  const images = useImageQueue(palaceId, updateSpot);

  // Run an async action with a status message; errors show as a toast instead of crashing.
  const run = useCallback(async (message, action) => {
    setError('');
    setBusy(message);
    try {
      return await action();
    } catch (e) {
      setError(e.message);
      return undefined;
    } finally {
      setBusy('');
    }
  }, []);

  // Walk to a spot, switching rooms if it's in another one.
  const goToSpot = useCallback((spot) => {
    setRoomId(spot.roomId);
    setFocusId(spot.id);
    setSelectedId(spot.id);
  }, []);

  const switchMode = useCallback((next) => {
    if (next === 'quiz') setQuizResults(null); // every visit to Quiz starts fresh
    setInspecting(false);
    setMovingId(null);
    setMode(next);
  }, []);

  const closeFeed = useCallback(() => setFeeding(false), []);

  if (!palace) return <div className="center">{error || 'Loading…'}</div>;

  const room = palace.rooms.find((r) => r.id === roomId) ?? palace.rooms[0];
  const numberOf = (spot) => palace.spots.indexOf(spot) + 1;
  const quizzing = mode === 'quiz' && quizResults;

  // How each friend looks right now (see Creature.jsx for the states).
  function friendState(spot) {
    if (quizzing && spot.fact) {
      if (spot.id in quizResults) return quizResults[spot.id] ? 'happy' : 'sleepy';
      return spot.id === focusId ? 'asking' : 'egg';
    }
    if (!spot.fact) return 'egg';
    if (['queued', 'working'].includes(images.status[spot.id])) return 'hatching';
    return 'awake';
  }

  function friendTag(spot, number) {
    if (quizzing && friendState(spot) === 'egg') return '?';
    if (mode === 'wander' && spot.id === selectedId) return 'you are here';
    if (mode === 'build' && spot.label) return `${number} · ${spot.label}`;
    return String(number);
  }

  const friends = palace.spots
    .filter((spot) => spot.roomId === room?.id)
    .map((spot) => {
      const number = numberOf(spot);
      return {
        spot,
        number,
        state: friendState(spot),
        tag: friendTag(spot, number),
        active: mode !== 'quiz' && spot.id === selectedId,
        // In Wander the friend you're visiting shows its picture right at its stop.
        picture: mode === 'wander' && spot.id === selectedId && spot.image ? imageUrl(spot.image) : null,
      };
    });
  const focusSpot = palace.spots.find((s) => s.id === focusId && s.roomId === room?.id);
  const current = palace.spots.find((s) => s.id === (mode === 'quiz' ? focusId : selectedId));
  const visitedUpTo = mode === 'build' || !current ? 0 : numberOf(current);
  const answered = quizResults ? Object.values(quizResults) : [];

  // ---- Build actions ----

  // A click in the room: moves a spot ("Move it"), closes the open card, or plants a new egg.
  function handlePlace(placement) {
    if (movingId) {
      const id = movingId;
      setMovingId(null);
      run('Moving…', async () => {
        updateSpot(await api.moveSpot(palace.id, id, { ...placement }));
        api.labelSpot(palace.id, id).then(updateSpot).catch((e) => console.error('Naming failed:', e));
      });
      return;
    }
    if (inspecting) {
      setInspecting(false);
      return;
    }
    run('Planting an egg…', async () => {
      const spot = await api.addSpot(palace.id, { roomId: room.id, ...placement });
      setPalace((p) => ({ ...p, spots: [...p.spots, spot] }));
      setSelectedId(spot.id); // highlight it, but don't swing the camera while placing
      // Gemini names it in the background; if that fails, the user can type a name.
      api.labelSpot(palace.id, spot.id).then(updateSpot).catch((e) => console.error('Naming failed:', e));
    });
  }

  function moveSpot(index, delta) {
    const ids = palace.spots.map((s) => s.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    run('Saving order…', async () => setPalace(await api.reorderSpots(palace.id, ids)));
  }

  function renameSpot(spot, label) {
    if (label.trim() === (spot.label ?? '')) return;
    run('', async () => updateSpot(await api.renameSpot(palace.id, spot.id, label)));
  }

  function removeSpot(spot) {
    if (spot.id === selectedId) setInspecting(false);
    run('Deleting…', async () => setPalace(await api.deleteSpot(palace.id, spot.id)));
  }

  function startOwnCopy() {
    run('Setting up your copy…', async () => {
      window.location.hash = `#/palace/${(await api.copyPalace(palace.id)).id}/feed`;
    });
  }

  function flipRoom() {
    run('Flipping…', async () => setPalace(await api.updateRoom(palace.id, room.id, { flipped: !room.flipped })));
  }

  function handleFriendClick(spot) {
    if (mode === 'quiz') {
      friendPicker?.(spot); // answering "where did you put X?"; otherwise no peeking
      return;
    }
    if (mode === 'wander' && !spot.fact) return;
    goToSpot(spot);
    if (mode === 'build') {
      setInspecting(true);
      setMovingId(null);
    }
  }

  const inspected = mode === 'build' && inspecting ? palace.spots.find((s) => s.id === selectedId) : null;

  return (
    <div className={`editor mode-${mode}`}>
      <header className="topbar">
        <div className="brand">
          <Logo href="#/" />
          <span className="scrawl palace-name">{palace.name}</span>
          {mock && <span className="chip yellow tiny" title="Set GEMINI_API_KEY in .env for real AI">mock AI</span>}
        </div>

        <div className="topbar-right">
          <nav className="tabs" aria-label="Mode">
            {MODES.map((m) => (
              <button key={m.id} className={mode === m.id ? 'on' : ''} aria-pressed={mode === m.id}
                onClick={() => switchMode(m.id)}>
                {m.label}
              </button>
            ))}
          </nav>
          {palace.readOnly && mode !== 'quiz' ? (
            <div className="readonly-banner">
              {palace.sample ? 'A finished example' : 'Shared campus route'}
              <button className="btn accent small"
                onClick={palace.sample ? () => run('Setting up…', () => startInBuiltIn()) : startOwnCopy}>
                {palace.sample ? 'Make one with my notes' : 'Start my own copy'}
              </button>
            </div>
          ) : mode === 'quiz' ? (
            <div className="score-pill">
              <span>Happy friends</span>
              <strong>{answered.filter(Boolean).length} / {answered.length}</strong>
            </div>
          ) : (
            <button className="btn accent" disabled={!palace.rooms.length} onClick={() => setFeeding(true)}
              title={palace.rooms.length ? '' : 'Add a room first'}>
              <Sparkle /> Fill from notes
            </button>
          )}
          <AccountMenu account={account} />
        </div>
      </header>

      <div className="workspace">
        {mode !== 'quiz' && (
          <PathList palace={palace} mode={mode} selectedId={selectedId} friendState={friendState}
            onSelect={handleFriendClick} onRename={renameSpot} onMove={moveSpot} onRemove={removeSpot} />
        )}

        <main className="stage">
          <div className="scene-frame">
            {room ? (
              <Viewer
                key={room.id}
                palaceId={palace.id}
                room={room}
                friends={friends}
                focusSpot={focusSpot}
                visitedUpTo={visitedUpTo}
                onPlace={mode === 'build' && !palace.readOnly ? handlePlace : undefined}
                onFriendClick={handleFriendClick}
              />
            ) : (
              <div className="center empty-room">
                <Creature state="egg" size="lg" />
                <p className="card-title">Start with a room you know by heart</p>
                <p className="scrawl">a 360° photo, a phone panorama, or a 3D scan</p>
              </div>
            )}

            <div className="bunting" aria-hidden="true">
              {Array.from({ length: 16 }, (_, k) => (
                <span key={k} style={{ borderTopColor: BUNTING[k % 5], animationDelay: `${(k * 0.2).toFixed(1)}s` }} />
              ))}
            </div>

            {mode === 'build' && room && (
              <>
                <span className="scene-hint">
                  {movingId ? 'Click where this stop should go' : inspected ? 'Click the room to close the card' : 'Click your room to plant an egg · click an egg to open it'}
                </span>
                {inspected && (
                  <SpotCard palace={palace} spot={inspected} number={numberOf(inspected)} moving={movingId === inspected.id}
                    onRename={renameSpot} onRemove={() => removeSpot(inspected)}
                    onShift={(delta) => moveSpot(numberOf(inspected) - 1, delta)}
                    onMoveStart={() => setMovingId((id) => (id ? null : inspected.id))}
                    onEditIdea={(fact) => run('Writing a new scene…', async () => updateSpot(await api.editIdea(palace.id, inspected.id, fact)))}
                    onClose={() => setInspecting(false)} />
                )}
                {room.type === 'splat' && (
                  <button className="btn ghost small flip" onClick={flipRoom}>Flip scan upside down</button>
                )}
              </>
            )}
            {mode === 'wander' && (
              <WanderCard palace={palace} images={images} selectedId={selectedId} goToSpot={goToSpot}
                onQuiz={() => switchMode('quiz')} onFeed={() => setFeeding(true)} />
            )}
            {mode === 'quiz' && (
              <>
                <QuizCard palace={palace} images={images} updateSpot={updateSpot}
                  results={quizResults} setResults={setQuizResults} goToSpot={goToSpot} setFriendPicker={setFriendPicker}
                  onWake={(spot) => { switchMode('wander'); goToSpot(spot); }} />
                {quizResults && (
                  <div className="legend">
                    <span>Bouncing = remembered</span>
                    <span>Sleeping = missed</span>
                    <span>Eggs = still ahead</span>
                  </div>
                )}
              </>
            )}

            {roomBanner && room?.id === roomBanner && (
              <div key={roomBanner} className="room-banner">walking into <strong>{room.name}</strong></div>
            )}
            {(busy || error) && (
              <div className={`toast ${error ? 'error' : ''}`} onClick={() => setError('')}>{error || busy}</div>
            )}
          </div>

          {mode === 'build' && (
            <RoomStrip palace={palace} setPalace={setPalace} room={room} setRoomId={setRoomId} run={run} />
          )}
        </main>
      </div>

      {feeding && (
        <FeedModal palace={palace} setPalace={setPalace} onClose={closeFeed}
          onDone={() => { setFeeding(false); switchMode('wander'); }} />
      )}
    </div>
  );
}
