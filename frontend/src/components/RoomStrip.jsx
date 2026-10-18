import { useRef, useState } from 'react';
import { api, fileUrl } from '../api.js';
import { resizeForUpload } from '../lib/resizeImage.js';

const SPLAT = /\.(ply|spz|splat|ksplat|sog)$/i;
const HOLD_MS = 10; // press this long on a room to pick it up
const DRAG_PX = 4; // a few pixels of wobble during a click isn't a drag

// Bottom strip in build mode: switch rooms, drag them into a new order, add panoramas or splat
// scans, delete rooms. With `browse` (Wander) it only switches rooms.
export default function RoomStrip({ palace, setPalace, room, setRoomId, run, browse = false }) {
  const [deletingId, setDeletingId] = useState(null); // this room's × asked "Delete?"
  const [drag, setDrag] = useState(null); // { id, order } while a room is being dragged
  const thumbs = useRef({}); // room id -> its element, to see where the pointer is
  const dragged = useRef(false); // the click that ends a drag shouldn't switch rooms

  async function handleUpload(event) {
    const files = [...event.target.files];
    event.target.value = ''; // so picking the same file again still triggers onChange
    if (!files.length) return;
    await run(`Uploading ${files.length} room(s)…`, async () => {
      // Photos get shrunk to a GPU-friendly size; splat scans go up as they are.
      const uploads = await Promise.all(files.map(async (file) => (SPLAT.test(file.name)
        ? { blob: file, name: file.name }
        : { blob: await resizeForUpload(file), name: 'panorama.jpg' })));
      const updated = await api.uploadRooms(palace.id, uploads);
      setPalace(updated);
      setRoomId(updated.rooms.at(-1).id);
    });
  }

  // Asked in the strip, not with window.confirm: browsers can silently block those pop-ups
  // (they answer "no" without showing anything), which made the × look broken.
  function remove(target) {
    setDeletingId(null);
    run('Deleting room…', async () => {
      setPalace(await api.deleteRoom(palace.id, target.id));
      setRoomId(null);
    });
  }

  // Press on a room, move, let go: it goes where you dropped it. A press that doesn't move is a click.
  function startDrag(e, id) {
    dragged.current = false;
    if (browse || e.button !== 0 || palace.rooms.length < 2) return;
    const start = { x: e.clientX, y: e.clientY };
    const original = palace.rooms.map((r) => r.id);
    let held = false;
    let order = original;
    const timer = setTimeout(() => { held = true; }, HOLD_MS);

    const move = (ev) => {
      if (!held || (!dragged.current && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_PX)) return;
      dragged.current = true;
      // Its new place: after every other room whose middle is left of the pointer.
      const others = order.filter((other) => other !== id);
      const index = others.filter((other) => {
        const box = thumbs.current[other]?.getBoundingClientRect();
        return box && box.left + box.width / 2 < ev.clientX;
      }).length;
      order = [...others.slice(0, index), id, ...others.slice(index)];
      setDrag({ id, order });
    };
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', done, true);
      setDrag(null);
    };
    const up = () => {
      done();
      if (!dragged.current || order.every((other, i) => other === original[i])) return;
      const byId = Object.fromEntries(palace.rooms.map((r) => [r.id, r]));
      if (room) setRoomId(room.id); // keep looking at the same room, even if it's no longer first
      setPalace((p) => ({ ...p, rooms: order.map((other) => byId[other]) })); // show it right away
      run('Saving room order…', async () => setPalace(await api.reorderRooms(palace.id, order)));
    };
    // Capture phase, so nothing on the page can stop us from hearing the pointer go up.
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', done, true);
  }

  const byId = Object.fromEntries(palace.rooms.map((r) => [r.id, r]));
  const rooms = drag ? drag.order.map((id) => byId[id]).filter(Boolean) : palace.rooms;

  return (
    <nav className={`rooms ${drag ? 'reordering' : ''}`}>
      {rooms.map((r) => {
        const spots = palace.spots.filter((s) => s.roomId === r.id).length;
        return (
          <div key={r.id} ref={(el) => { thumbs.current[r.id] = el; }}
            className={`room-thumb ${r.id === room?.id ? 'active' : ''} ${drag?.id === r.id ? 'dragging' : ''}`}>
            <button className="thumb" onPointerDown={(e) => startDrag(e, r.id)}
              onClick={() => { if (!dragged.current) setRoomId(r.id); }}
              title={!browse && palace.rooms.length > 1 ? 'Click to open · drag to reorder' : undefined}
              style={r.type !== 'splat' ? { backgroundImage: `url(${fileUrl(palace.id, r.thumb ?? r.file)})` } : undefined}>
              {r.type === 'splat' && <span className="room-kind">3D scan</span>}
              <span className="room-name">{r.name}</span>
            </button>
            {browse ? null : deletingId === r.id ? (
              <div className="room-confirm" role="alertdialog" aria-label={`Delete ${r.name}?`}>
                <span>Delete{spots ? ` with ${spots} stop${spots === 1 ? '' : 's'}` : ''}?</span>
                <div>
                  <button className="btn small danger" autoFocus onClick={() => remove(r)}>Delete</button>
                  <button className="btn ghost small" onClick={() => setDeletingId(null)}>Keep</button>
                </div>
              </div>
            ) : (
              <button className="delete" title="Delete room" aria-label={`Delete ${r.name}`}
                onClick={() => setDeletingId(r.id)}>×</button>
            )}
          </div>
        );
      })}
      {!browse && <label className="add-room">
        + Add a room
        <input type="file" multiple hidden onChange={handleUpload}
          accept="image/jpeg,image/png,image/webp,.ply,.spz,.splat,.ksplat,.sog" />
      </label>}
    </nav>
  );
}
