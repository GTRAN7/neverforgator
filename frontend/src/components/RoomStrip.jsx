import { api, fileUrl } from '../api.js';
import { resizeForUpload } from '../lib/resizeImage.js';

const SPLAT = /\.(ply|spz|splat|ksplat|sog)$/i;

// Bottom strip in build mode: switch rooms, add panoramas or splat scans, delete rooms.
export default function RoomStrip({ palace, setPalace, room, setRoomId, run }) {
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

  function remove(target) {
    if (!window.confirm(`Delete ${target.name} and its spots?`)) return;
    run('Deleting room…', async () => {
      setPalace(await api.deleteRoom(palace.id, target.id));
      setRoomId(null);
    });
  }

  return (
    <nav className="rooms">
      {palace.rooms.map((r) => (
        <div key={r.id} className={`room-thumb ${r.id === room?.id ? 'active' : ''}`}>
          <button className="thumb" onClick={() => setRoomId(r.id)}
            style={r.type === 'panorama' ? { backgroundImage: `url(${fileUrl(palace.id, r.file)})` } : undefined}>
            {r.type === 'splat' && <span className="room-kind">3D scan</span>}
            <span className="room-name">{r.name}</span>
          </button>
          <button className="delete" title="Delete room" onClick={() => remove(r)}>×</button>
        </div>
      ))}
      <label className="add-room">
        + Add a room
        <input type="file" multiple hidden onChange={handleUpload}
          accept="image/jpeg,image/png,image/webp,.ply,.spz,.splat,.ksplat,.sog" />
      </label>
    </nav>
  );
}
