// File-based storage. Each palace is a folder:
//   data/palaces/<id>/palace.json   – owner, rooms, spots, facts, scenes
//   data/palaces/<id>/room-*        – uploaded panoramas and 3D scans
//   data/palaces/<id>/crop-*.jpg    – what the user clicked for each spot
// Everything goes through this file, so it can later be swapped for Postgres
// without touching the routes.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATA_DIR = path.join(import.meta.dirname, 'data', 'palaces');
const ID_PATTERN = /^[a-f0-9]{8}$/;

export const newId = () => crypto.randomBytes(4).toString('hex');

// Returns the folder for a palace id, or null if the id is malformed
// (this also blocks path tricks like "../../etc").
export function palaceDir(id) {
  return ID_PATTERN.test(id) ? path.join(DATA_DIR, id) : null;
}

export async function readPalace(id) {
  const dir = palaceDir(id);
  if (!dir) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(dir, 'palace.json'), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// Write to a temp file then rename, so a crash mid-write never leaves a broken palace.json.
async function writePalace(palace) {
  const file = path.join(palaceDir(palace.id), 'palace.json');
  await fs.writeFile(file + '.tmp', JSON.stringify(palace, null, 2));
  await fs.rename(file + '.tmp', file);
}

// Can this user see / change this palace?
// Templates (like the UF campus palace) can be seen and copied by everyone.
// Palaces from before login existed have no owner and stay open to everyone.
export const canRead = (palace, userId) => !palace.owner || palace.owner === userId || Boolean(palace.template);
export const canWrite = (palace, userId) => !palace.owner || palace.owner === userId;

export async function createPalace(name, owner) {
  const palace = { id: newId(), name, owner, createdAt: new Date().toISOString(), rooms: [], spots: [] };
  await fs.mkdir(palaceDir(palace.id), { recursive: true });
  await writePalace(palace);
  return palace;
}

// The user's own palaces plus every template.
export async function listPalaces(userId) {
  const ids = await fs.readdir(DATA_DIR).catch(() => []);
  const palaces = await Promise.all(ids.map(readPalace));
  return palaces
    .filter((p) => p && canRead(p, userId))
    .map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      roomCount: p.rooms.length,
      spotCount: p.spots.length,
      template: Boolean(p.template),
      mine: canWrite(p, userId),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Start a new palace from a template: same rooms and spots (positions and names),
// but no facts yet. Files are hard-linked, so a 95 MB scan isn't copied per user.
export async function copyPalace(source, owner) {
  const copy = await createPalace(source.name, owner);
  const from = palaceDir(source.id);
  const to = palaceDir(copy.id);
  const link = (file) => fs.link(path.join(from, file), path.join(to, file)).catch(() =>
    fs.copyFile(path.join(from, file), path.join(to, file)));

  const roomIds = new Map();
  for (const room of source.rooms) {
    await link(room.file);
    const id = newId();
    roomIds.set(room.id, id);
    copy.rooms.push({ ...room, id });
  }
  for (const spot of source.spots) {
    if (spot.crop) await link(spot.crop);
    const { roomId, label, crop, direction, point, viewFrom } = spot;
    copy.spots.push({
      id: newId(), roomId: roomIds.get(roomId), label, crop, direction, point, viewFrom, weirdness: 0, misses: 0,
    });
  }
  copy.copiedFrom = source.id;
  await writePalace(copy);
  return copy;
}

// Read-modify-write, one at a time per palace. Later we'll generate many spots
// in parallel; without this queue, two saves at once could overwrite each other.
const queues = new Map();
export function updatePalace(id, change) {
  const run = (queues.get(id) ?? Promise.resolve()).then(async () => {
    const palace = await readPalace(id);
    if (!palace) return null;
    await change(palace);
    await writePalace(palace);
    return palace;
  });
  queues.set(id, run.catch(() => {}));
  return run;
}
