import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import {
  DATA_DIR, newId, palaceDir, readPalace, createPalace, listPalaces, updatePalace, copyPalace, deletePalace, canRead, canWrite,
} from './storage.js';
import { AUTH_ENABLED, requireUser } from './auth.js';
import { CACHE_DIR } from './cache.js';
import * as gemini from './gemini.js';
import { fillPalace } from './fill.js';
import { CAPS, DAILY, quota, burstLimit, usageFor } from './limits.js';

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  // Uploaded and generated files (SVG doodles included) may never run scripts, even opened directly.
  if (req.path.startsWith('/files/') || req.path.startsWith('/cache/')) {
    res.set('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox");
  }
  next();
});
app.use(express.json({ limit: '5mb' })); // spot crops arrive as base64 JPEGs

// Uploaded files: /files/<palaceId>/<file>. Generated images: /cache/<file>.
app.use('/files', express.static(DATA_DIR, { index: false, maxAge: '1h' }));
app.use('/cache', express.static(CACHE_DIR, { maxAge: '7d' }));

app.get('/api/status', (req, res) => res.json({
  mock: gemini.MOCK, pictures: gemini.PICTURES, models: gemini.models, caps: CAPS,
}));

// Small helpers so every route reports "not found" the same way.
class NotFound extends Error { status = 404; }

// ---- Who is calling, and may they touch this palace? ----
// Uploaded files and generated images above stay public (an <img> tag can't send a token);
// their names are random.

app.use(['/api/palaces', '/api/import', '/api/usage'], requireUser, burstLimit);

// How much of today's fair-use quota is left (see limits.js).
app.get('/api/usage', async (req, res) => res.json(await usageFor(req.userId)));

// ---- Import notes from a photo, PDF or voice recording → text for the notes box ----

const IMPORT_TYPES = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf|audio\/[\w.+-]+|video\/webm)$/;
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CAPS.importBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    if (IMPORT_TYPES.test(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error('Import a photo (JPEG/PNG/HEIC), a PDF or an audio recording'), { status: 400 }));
  },
});

app.post('/api/import', quota('import'), importUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
  // m4a voice memos arrive as audio/x-m4a or audio/mp4; Gemini knows them as audio/aac or audio/mp4.
  const mimeType = req.file.mimetype === 'audio/x-m4a' ? 'audio/mp4' : req.file.mimetype;
  const { text } = await gemini.extractNotes(req.file.buffer, mimeType, fileHash);
  res.json({ text: text.trim().slice(0, CAPS.notesChars) });
});

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
app.patch('/api/palaces/:id', async (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: 'Give it a name' });
  res.json(await updatePalace(req.params.id, (p) => { p.name = name; }));
});

app.delete('/api/palaces/:id', async (req, res) => {
  await deletePalace(req.params.id);
  res.status(204).end();
});

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

// Where a spot is: a direction (panorama) or a 3D point + where the camera stood (splat).
function readPosition(body) {
  const { direction, point, viewFrom } = body ?? {};
  if (isVector(direction)) return { direction, point: undefined, viewFrom: undefined };
  if (isVector(point) && isVector(viewFrom)) return { direction: undefined, point, viewFrom };
  return null;
}

// Save a crop of what the user clicked: used to name the spot, and as the
// reference photo when generating the scene image.
async function saveCrop(palaceId, spotId, crop) {
  const match = /^data:image\/jpeg;base64,(.+)$/.exec(crop ?? '');
  if (!match) return undefined;
  const file = `crop-${spotId}-${Date.now().toString(36)}.jpg`;
  await fs.writeFile(path.join(palaceDir(palaceId), file), Buffer.from(match[1], 'base64'));
  return file;
}

app.post('/api/palaces/:id/spots', async (req, res) => {
  const palace = await getPalace(req.params.id);
  if (!palace.rooms.some((r) => r.id === req.body?.roomId)) throw new NotFound('Room not found');
  const position = readPosition(req.body);
  if (!position) return res.status(400).json({ error: 'A spot needs a direction (panorama) or point + viewFrom (splat)' });

  const spot = { id: newId(), roomId: req.body.roomId, label: null, weirdness: 0, misses: 0, ...position };
  spot.crop = await saveCrop(palace.id, spot.id, req.body.crop);
  await updatePalace(palace.id, (p) => { p.spots.push(spot); });
  res.status(201).json(spot);
});

// Ask Gemini what the clicked object is ("desk lamp"). Called right after placing,
// separately, so the egg appears instantly and the name fills in a few seconds later.
app.post('/api/palaces/:id/spots/:spotId/label', quota('label'), async (req, res) => {
  const { palace, spot } = await getSpot(req.params.id, req.params.spotId);
  if (spot.label || !spot.crop) return res.json(spot);
  const crop = await fs.readFile(path.join(palaceDir(palace.id), spot.crop));
  const label = await gemini.labelSpot(crop);
  // Keep a name the user typed while we were waiting.
  res.json(await updateSpot(palace.id, spot.id, (s) => { s.label ||= label; }));
});

// Rename a spot ({ label }), or move it ({ direction } or { point, viewFrom }, plus a new crop).
// A moved spot is on a new object: it loses its old name and picture, and counts as placed by the user.
app.patch('/api/palaces/:id/spots/:spotId', async (req, res) => {
  const position = readPosition(req.body);
  const crop = position ? await saveCrop(req.params.id, req.params.spotId, req.body.crop) : undefined;
  res.json(await updateSpot(req.params.id, req.params.spotId, (s) => {
    if ('label' in (req.body ?? {})) s.label = String(req.body.label ?? '').trim().slice(0, 40) || null;
    if (position) {
      Object.assign(s, position, { crop, label: null, image: null, auto: false });
      for (const key of ['direction', 'point', 'viewFrom']) if (s[key] === undefined) delete s[key];
    }
  }));
});

// Fix the idea a stop holds (Gemini can get things wrong). Body: { fact }. The scene is rewritten to match.
app.put('/api/palaces/:id/spots/:spotId/idea', quota('scene'), async (req, res) => {
  const fact = String(req.body?.fact ?? '').trim();
  if (!fact) return res.status(400).json({ error: 'Write the idea first' });
  if (fact.length > CAPS.ideaChars) return res.status(400).json({ error: `Keep one idea under ${CAPS.ideaChars} characters` });
  const { palace, spot } = await getSpot(req.params.id, req.params.spotId);
  const number = palace.spots.indexOf(spot) + 1;
  const idea = { text: fact, kind: spot.kind ?? 'fact', keyTerms: keyTermsOf(fact) };
  const [item] = await gemini.writeScenes([idea], [spot.label || `spot ${number}`]);
  res.json(await updateSpot(palace.id, spot.id, (s) => {
    Object.assign(s, { fact, keyTerms: idea.keyTerms, scene: item.scene, hook: item.hook, imagePrompt: item.imagePrompt, image: null, weirdness: 0 });
  }));
});

// Rough key terms for a hand-written idea: its longest words and any numbers.
const keyTermsOf = (text) => [...new Set(text.match(/\d[\d.,:]*|[A-Za-z][\w'-]{5,}/g) ?? [])]
  .sort((a, b) => /\d/.test(b) - /\d/.test(a) || b.length - a.length).slice(0, 3);

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

// ---- Fill: notes → the whole palace (see fill.js) ----

app.post('/api/palaces/:id/fill', quota('fill'), async (req, res) => {
  const notes = String(req.body?.notes ?? '').trim();
  const style = Object.hasOwn(gemini.PICTURE_STYLES, req.body?.style ?? '') ? req.body.style : 'storybook';
  if (!notes) return res.status(400).json({ error: 'Paste some notes first' });
  if (notes.length > CAPS.notesChars) {
    return res.status(400).json({ error: `Notes are capped at ${CAPS.notesChars.toLocaleString()} characters. Split them into two palaces.` });
  }
  res.json(await fillPalace(await getPalace(req.params.id), notes, style));
});

// Generate (or fetch from cache) the image for one spot. The client calls this
// for each spot, a few at a time, so it can show progress.
app.post('/api/palaces/:id/spots/:spotId/image', quota('picture'), async (req, res) => {
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
// Answers are checked in the browser (instant). The server just keeps score.

app.post('/api/palaces/:id/spots/:spotId/result', async (req, res) => {
  const correct = Boolean(req.body?.correct);
  res.json(await updateSpot(req.params.id, req.params.spotId, (s) => {
    if (!correct) s.misses += 1;
  }));
});

// Spaced review, like memory athletes do it: walk the palace again after 1, 3, 7, 21 and 60 days.
// A good quiz (80%+) moves you to the next gap; a weak one means "walk it again in 10 minutes".
const REVIEW_DAYS = [1, 3, 7, 21, 60];
const DAY = 24 * 60 * 60 * 1000;

app.post('/api/palaces/:id/reviews', async (req, res) => {
  const total = Math.max(0, Number.parseInt(req.body?.total, 10) || 0);
  const score = Math.max(0, Math.min(total, Number.parseInt(req.body?.score, 10) || 0));
  if (!total) return res.status(400).json({ error: 'Empty quiz' });
  const palace = await updatePalace(req.params.id, (p) => {
    p.reviews = [...(p.reviews ?? []), { at: new Date().toISOString(), score, total }];
    let streak = 0;
    for (const r of [...p.reviews].reverse()) {
      if (r.score / r.total < 0.8) break;
      streak += 1;
    }
    const wait = streak ? REVIEW_DAYS[Math.min(streak, REVIEW_DAYS.length) - 1] * DAY : 10 * 60 * 1000;
    p.nextReviewAt = new Date(Date.now() + wait).toISOString();
  });
  if (!palace) throw new NotFound('Palace not found');
  res.json({ nextReviewAt: palace.nextReviewAt, reviews: palace.reviews });
});

// A missed spot gets a new, weirder scene. The client then asks for its new image.
app.post('/api/palaces/:id/spots/:spotId/weirder', quota('scene'), async (req, res) => {
  const { palace, spot } = await getSpot(req.params.id, req.params.spotId);
  if (!spot.fact) return res.status(400).json({ error: 'This spot has no fact' });

  const level = Math.min(5, spot.weirdness + 1);
  const index = palace.spots.indexOf(spot);
  const { scene, hook, imagePrompt } = await gemini.weirderScene({
    fact: spot.fact, kind: spot.kind ?? 'fact', label: spot.label || `spot ${index + 1}`, scene: spot.scene, level,
  });
  res.json(await updateSpot(palace.id, spot.id, (s) => {
    Object.assign(s, { scene, hook, imagePrompt, image: null, weirdness: level });
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
  console.log(`Neverforgator API on http://localhost:${port}`);
  console.log(AUTH_ENABLED ? `Auth0 login required (${process.env.AUTH0_DOMAIN})` : 'Auth0 off: everyone is the local user.');
  console.log(gemini.MOCK
    ? 'No GEMINI_API_KEY: running in MOCK mode (placeholder AI results).'
    : `Gemini models: text=${gemini.models.text}, pictures=${gemini.PICTURES === 'gemini' ? gemini.models.image : gemini.PICTURES}`);
});
