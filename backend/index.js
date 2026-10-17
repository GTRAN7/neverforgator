import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DATA_DIR, newId, palaceDir, readPalace, createPalace, listPalaces, updatePalace, copyPalace, canRead, canWrite,
} from './storage.js';
import { AUTH_ENABLED, requireUser } from './auth.js';
import { CACHE_DIR } from './cache.js';
import * as gemini from './gemini.js';

const app = express();
app.use(express.json({ limit: '5mb' })); // spot crops arrive as base64 JPEGs

// Uploaded files: /files/<palaceId>/<file>. Generated images: /cache/<file>.
app.use('/files', express.static(DATA_DIR, { index: false, maxAge: '1h' }));
app.use('/cache', express.static(CACHE_DIR, { maxAge: '7d' }));

app.get('/api/status', (req, res) => res.json({
  mock: gemini.MOCK, placeholderPictures: gemini.PLACEHOLDER_PICTURES, models: gemini.models,
}));

// Small helpers so every route reports "not found" the same way.
class NotFound extends Error { status = 404; }

// ---- Who is calling, and may they touch this palace? ----
// Uploaded files and generated images above stay public (an <img> tag can't send a token);
// their names are random.

app.use('/api/palaces', requireUser);

// Every /api/palaces/:id/... route: the palace must belong to the caller. Templates
// (the shared UF campus palace) can also be read and copied by anyone, but not changed.
app.use('/api/palaces/:id', async (req, res, next) => {
  const palace = await readPalace(req.params.id);
  if (!palace || !canRead(palace, req.userId)) throw new NotFound('Palace not found');
  const readOnly = req.method === 'GET' || req.path === '/copy';
  if (!readOnly && !canWrite(palace, req.userId)) {
    return res.status(403).json({ error: 'This is a shared template. Start your own copy to change it.' });
  }
  next();
});

async function getPalace(id) {
  const palace = await readPalace(id);
  if (!palace) throw new NotFound('Palace not found');
  return palace;
}

async function getSpot(palaceId, spotId) {
  const palace = await getPalace(palaceId);
  const spot = palace.spots.find((s) => s.id === spotId);
  if (!spot) throw new NotFound('Spot not found');
  return { palace, spot };
}

// Change one spot inside the save queue; returns the updated spot.
async function updateSpot(palaceId, spotId, change) {
  let updated;
  await updatePalace(palaceId, (p) => {
    updated = p.spots.find((s) => s.id === spotId);
    if (!updated) throw new NotFound('Spot not found');
    change(updated);
  });
  if (!updated) throw new NotFound('Palace not found');
  return updated;
}

// ---- Palaces ----

app.get('/api/palaces', async (req, res) => {
  res.json(await listPalaces(req.userId));
});

app.post('/api/palaces', async (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 80) || 'My palace';
  res.status(201).json(await createPalace(name, req.userId));
});

// Start your own palace from a template (e.g. the UF campus route).
app.post('/api/palaces/:id/copy', async (req, res) => {
  res.status(201).json(await copyPalace(await getPalace(req.params.id), req.userId));
});

app.get('/api/palaces/:id', async (req, res) => {
  const palace = await getPalace(req.params.id);
  res.json({ ...palace, readOnly: !canWrite(palace, req.userId) });
});

// ---- Rooms: a panorama photo or a Gaussian splat scan ----

const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const SPLAT_EXTENSIONS = ['.ply', '.spz', '.splat', '.ksplat', '.sog'];
const splatExtension = (file) => {
  const ext = path.extname(file.originalname).toLowerCase();
  return SPLAT_EXTENSIONS.includes(ext) ? ext : null;
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, palaceDir(req.params.id)),
    filename: (req, file, cb) =>
      cb(null, `room-${newId()}${splatExtension(file) ?? IMAGE_TYPES[file.mimetype]}`),
  }),
  limits: { fileSize: 500 * 1024 * 1024, files: 10 }, // splat scans can be big
  fileFilter: (req, file, cb) => {
    if (IMAGE_TYPES[file.mimetype] || splatExtension(file)) cb(null, true);
    else cb(Object.assign(new Error('Upload a JPEG/PNG/WebP panorama or a .ply/.spz/.splat scan'), { status: 400 }));
  },
});

// Make sure the palace exists before multer writes anything into its folder.
async function requirePalace(req, res, next) {
  await getPalace(req.params.id);
  next();
}

app.post('/api/palaces/:id/rooms', requirePalace, upload.array('room'), async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'No file uploaded' });
  const palace = await updatePalace(req.params.id, (p) => {
    for (const file of req.files) {
      p.rooms.push({
        id: newId(),
        name: `Room ${p.rooms.length + 1}`,
        type: splatExtension(file) ? 'splat' : 'panorama',
        file: file.filename,
        flipped: Boolean(splatExtension(file)), // most splat exports (Polycam etc.) come in upside down
      });
    }
  });
  res.status(201).json(palace);
});

app.patch('/api/palaces/:id/rooms/:roomId', async (req, res) => {
  const { name, flipped } = req.body ?? {};
  const palace = await updatePalace(req.params.id, (p) => {
    const room = p.rooms.find((r) => r.id === req.params.roomId);
    if (!room) throw new NotFound('Room not found');
    if (typeof name === 'string') room.name = name.trim().slice(0, 40) || room.name;
    if (typeof flipped === 'boolean') room.flipped = flipped;
  });
  if (!palace) throw new NotFound('Palace not found');
  res.json(palace);
});

app.delete('/api/palaces/:id/rooms/:roomId', async (req, res) => {
  let removed;
  const palace = await updatePalace(req.params.id, (p) => {
    removed = p.rooms.find((r) => r.id === req.params.roomId);
    p.rooms = p.rooms.filter((r) => r.id !== req.params.roomId);
    p.spots = p.spots.filter((s) => s.roomId !== req.params.roomId);
  });
  if (!palace) throw new NotFound('Palace not found');
  if (removed) await fs.rm(path.join(palaceDir(palace.id), removed.file), { force: true });
  res.json(palace);
});

// ---- Spots: the numbered stops on the walking path (array order = path order) ----

const isVector = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

app.post('/api/palaces/:id/spots', async (req, res) => {
  const { roomId, direction, point, viewFrom, crop } = req.body ?? {};
  const palace = await getPalace(req.params.id);
  if (!palace.rooms.some((r) => r.id === roomId)) throw new NotFound('Room not found');
  if (!isVector(direction) && !(isVector(point) && isVector(viewFrom))) {
    return res.status(400).json({ error: 'A spot needs a direction (panorama) or point + viewFrom (splat)' });
  }

  const spot = { id: newId(), roomId, label: null, weirdness: 0, misses: 0 };
  if (isVector(direction)) spot.direction = direction;
  else Object.assign(spot, { point, viewFrom });

  // Save a crop of what the user clicked: used to name the spot, and as the
  // reference photo when generating the scene image.
  const match = /^data:image\/jpeg;base64,(.+)$/.exec(crop ?? '');
  if (match) {
    spot.crop = `crop-${spot.id}.jpg`;
    await fs.writeFile(path.join(palaceDir(palace.id), spot.crop), Buffer.from(match[1], 'base64'));
  }

  await updatePalace(palace.id, (p) => { p.spots.push(spot); });
  res.status(201).json(spot);
});

// Ask Gemini what the clicked object is ("desk lamp"). Called right after placing,
// separately, so the egg appears instantly and the name fills in a few seconds later.
app.post('/api/palaces/:id/spots/:spotId/label', async (req, res) => {
  const { palace, spot } = await getSpot(req.params.id, req.params.spotId);
  if (spot.label || !spot.crop) return res.json(spot);
  const crop = await fs.readFile(path.join(palaceDir(palace.id), spot.crop));
  const label = await gemini.labelSpot(crop);
  // Keep a name the user typed while we were waiting.
  res.json(await updateSpot(palace.id, spot.id, (s) => { s.label ||= label; }));
});

app.patch('/api/palaces/:id/spots/:spotId', async (req, res) => {
  const label = String(req.body?.label ?? '').trim().slice(0, 40) || null;
  res.json(await updateSpot(req.params.id, req.params.spotId, (s) => { s.label = label; }));
});

app.delete('/api/palaces/:id/spots/:spotId', async (req, res) => {
  const palace = await updatePalace(req.params.id, (p) => {
    p.spots = p.spots.filter((s) => s.id !== req.params.spotId);
  });
  if (!palace) throw new NotFound('Palace not found');
  res.json(palace);
});

// Reorder the walking path. Body: { ids: [spotId, ...] } in the new order.
app.put('/api/palaces/:id/spots/order', async (req, res) => {
  const ids = req.body?.ids ?? [];
  const palace = await updatePalace(req.params.id, (p) => {
    const byId = new Map(p.spots.map((s) => [s.id, s]));
    if (ids.length !== p.spots.length || !ids.every((id) => byId.has(id))) {
      throw Object.assign(new Error('Order must list every spot exactly once'), { status: 400 });
    }
    p.spots = ids.map((id) => byId.get(id));
  });
  if (!palace) throw new NotFound('Palace not found');
  res.json(palace);
});

// ---- Fill: notes → one fact + scene per spot ----

app.post('/api/palaces/:id/fill', async (req, res) => {
  const notes = String(req.body?.notes ?? '').trim().slice(0, 20000);
  const style = Object.hasOwn(gemini.PICTURE_STYLES, req.body?.style ?? '') ? req.body.style : 'storybook';
  const palace = await getPalace(req.params.id);
  if (!notes) return res.status(400).json({ error: 'Paste some notes first' });
  if (!palace.spots.length) return res.status(400).json({ error: 'Place some spots first' });

  const locations = palace.spots.map((s, i) => s.label || `spot ${i + 1}`);
  const items = await gemini.fillSpots(notes, locations);

  const updated = await updatePalace(palace.id, (p) => {
    p.notes = notes;
    p.style = style;
    p.spots.forEach((spot, i) => {
      const item = items.find((it) => it.location === i + 1);
      Object.assign(spot, {
        fact: item?.fact ?? null,
        scene: item?.scene ?? null,
        imagePrompt: item?.imagePrompt ?? null,
        image: null,
        weirdness: 0,
        misses: 0,
      });
    });
  });
  res.json(updated);
});

// Generate (or fetch from cache) the image for one spot. The client calls this
// for each spot, a few at a time, so it can show progress.
app.post('/api/palaces/:id/spots/:spotId/image', async (req, res) => {
  const { palace, spot } = await getSpot(req.params.id, req.params.spotId);
  if (!spot.imagePrompt) return res.status(400).json({ error: 'This spot has no scene yet' });

  const crop = spot.crop
    ? await fs.readFile(path.join(palaceDir(palace.id), spot.crop)).catch(() => null)
    : null;
  const image = await gemini.generateImage(spot.imagePrompt, crop, palace.style);

  // Only save it if the scene didn't change while we were generating.
  res.json(await updateSpot(palace.id, spot.id, (s) => {
    if (s.imagePrompt === spot.imagePrompt) s.image = image;
  }));
});

// ---- Quiz ----

// The quiz asks both ways. Body is either:
//   { answer: "..." }  "What lives here?"      → Gemini grades the typed answer
//   { placeId: "..." } "Where did you put X?"  → correct if they picked this spot
app.post('/api/palaces/:id/spots/:spotId/grade', async (req, res) => {
  const { palace, spot } = await getSpot(req.params.id, req.params.spotId);
  if (!spot.fact) return res.status(400).json({ error: 'This spot has no fact' });

  let result;
  if (req.body && 'placeId' in req.body) {
    const number = palace.spots.indexOf(spot) + 1;
    const place = `${number} · ${spot.label || `spot ${number}`}`;
    result = req.body.placeId === spot.id
      ? { correct: true, feedback: `Yes! It lives at ${place}.` }
      : { correct: false, feedback: `It actually lives at ${place}.` };
  } else {
    const answer = String(req.body?.answer ?? '').trim().slice(0, 2000);
    result = answer
      ? await gemini.gradeAnswer(spot.fact, answer)
      : { correct: false, feedback: `The fact was: ${spot.fact}` };
  }
  if (!result.correct) await updateSpot(palace.id, spot.id, (s) => { s.misses += 1; });
  res.json(result);
});

// A missed spot gets a new, weirder scene. The client then asks for its new image.
app.post('/api/palaces/:id/spots/:spotId/weirder', async (req, res) => {
  const { palace, spot } = await getSpot(req.params.id, req.params.spotId);
  if (!spot.fact) return res.status(400).json({ error: 'This spot has no fact' });

  const level = Math.min(5, spot.weirdness + 1);
  const index = palace.spots.indexOf(spot);
  const { scene, imagePrompt } = await gemini.weirderScene({
    fact: spot.fact, label: spot.label || `spot ${index + 1}`, scene: spot.scene, level,
  });
  res.json(await updateSpot(palace.id, spot.id, (s) => {
    Object.assign(s, { scene, imagePrompt, image: null, weirdness: level });
  }));
});

// ---- Production: serve the built frontend (npm run build && npm start) ----

const DIST = path.join(import.meta.dirname, '..', 'frontend', 'dist');
app.use(express.static(DIST));
app.get(/^\/(?!api|files|cache).*/, (req, res, next) =>
  res.sendFile(path.join(DIST, 'index.html'), (err) => err && next()));

// Turn any thrown error into a JSON message the UI can show.
app.use((err, req, res, next) => {
  const status = err instanceof multer.MulterError ? 400 : err.status ?? 500;
  if (status >= 500) console.error(err.message);
  res.status(status).json({ error: status === 500 ? `Server error: ${err.message}` : err.message });
});

await fs.mkdir(DATA_DIR, { recursive: true });
try {
  await gemini.chooseModels();
} catch (err) {
  console.error('Could not list Gemini models, falling back to defaults:', err.message);
  gemini.models.text ||= 'gemini-2.5-flash';
  gemini.models.image ||= 'gemini-2.5-flash-image';
}
const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Mind Palace API on http://localhost:${port}`);
  console.log(AUTH_ENABLED ? `Auth0 login required (${process.env.AUTH0_DOMAIN})` : 'Auth0 off: everyone is the local user.');
  console.log(gemini.MOCK
    ? 'No GEMINI_API_KEY: running in MOCK mode (placeholder AI results).'
    : `Gemini models: text=${gemini.models.text}, image=${gemini.PLACEHOLDER_PICTURES ? 'off (placeholder sketches; set PICTURES=gemini to draw)' : gemini.models.image}`);
});
