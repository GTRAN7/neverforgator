// Fill: notes → the whole palace.
// The memory-athlete order: cut the notes into ideas (one picture each), give every idea its own
// stop (the user's placed stops first, then stops Gemini finds in the panoramas), then write a scene
// per stop. Ideas that don't fit wait, and the UI asks for more room instead of cramming stops.
// Used by POST /fill and by scripts/seed-samples.js.
import fs from 'node:fs/promises';
import path from 'node:path';
import { newId, palaceDir, updatePalace } from './storage.js';
import * as gemini from './gemini.js';
import { imageSize, photoPointToDirection, angleBetween } from './panorama.js';

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

// Stops Gemini finds in the panoramas, skipping anything close to a stop that's already there.
// All rooms are looked at in parallel (once each, then cached).
async function findExtraStops(palace, keptSpots, needed) {
  const rooms = palace.rooms.filter((r) => r.type === 'panorama');
  const perRoom = await Promise.all(rooms.map(async (room) => {
    const photo = await fs.readFile(path.join(palaceDir(palace.id), room.file));
    const size = imageSize(photo) ?? { width: 2, height: 1 };
    const mimeType = room.file.endsWith('.png') ? 'image/png' : room.file.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    const stops = await gemini.findStops(photo, mimeType, room.file);
    // Left to right in the photo = walking around the room.
    return [...stops].sort((a, b) => a.x - b.x).map((stop) => ({
      roomId: room.id,
      label: stop.label.trim().slice(0, 40),
      direction: photoPointToDirection(stop.x / 1000, stop.y / 1000, size),
    }));
  }));

  // Skip stops too close to another one, or with the same name as another one (two "foosball
  // table" stops in overlapping photos): stops you can't tell apart in your head mix up their facts.
  const found = [];
  const names = new Set(keptSpots.map((s) => s.label?.toLowerCase()));
  for (const stop of perRoom.flat()) {
    if (found.length >= needed) break;
    const tooClose = [...keptSpots, ...found].some((s) =>
      s.roomId === stop.roomId && s.direction && angleBetween(s.direction, stop.direction) < 0.25);
    if (tooClose || names.has(stop.label.toLowerCase())) continue;
    names.add(stop.label.toLowerCase());
    found.push(stop);
  }
  return found;
}

export async function fillPalace(palace, notes, style, flavor = 'wild') {
  if (!palace.rooms.length) throw badRequest('Add a room first');
  const ideas = await gemini.splitNotes(notes);
  if (!ideas.length) throw badRequest('Couldn’t find anything to remember in those notes');

  // Stops added by an earlier fill are rebuilt each time; stops the user placed are kept.
  // The path walks room by room (in the order of the room strip), like a real walk.
  const kept = palace.spots.filter((s) => !s.auto);
  const extra = kept.length < ideas.length ? await findExtraStops(palace, kept, ideas.length - kept.length) : [];
  const roomIndex = (s) => palace.rooms.findIndex((r) => r.id === s.roomId);
  const walk = [...kept, ...extra.map((stop) => ({ ...stop, id: newId(), auto: true, weirdness: 0, misses: 0 }))]
    .sort((a, b) => roomIndex(a) - roomIndex(b));
  const stopCount = Math.min(walk.length, ideas.length);
  if (!stopCount) throw badRequest('No stops yet. Plant a few eggs by clicking your room, or add a panorama.');

  const placed = ideas.slice(0, stopCount);
  const items = await gemini.writeScenes(placed, walk.slice(0, stopCount).map((s, i) => s.label || `spot ${i + 1}`), flavor);
  const filled = (i) => {
    const item = i < stopCount ? items.find((it) => it.location === i + 1) : null;
    return {
      fact: item ? placed[i].text : null,
      kind: item ? placed[i].kind : null,
      keyTerms: item ? placed[i].keyTerms : null,
      scene: item?.scene ?? null,
      hook: item?.hook ?? null,
      imagePrompt: item?.imagePrompt ?? null,
      image: null,
      weirdness: 0,
      misses: 0,
    };
  };

  return updatePalace(palace.id, (p) => {
    const current = new Map(p.spots.map((s) => [s.id, s]));
    p.notes = notes;
    p.style = style;
    p.flavor = flavor;
    p.spots = walk
      .map((stop, i) => ({ ...(current.get(stop.id) ?? stop), ...filled(i) }))
      .filter((spot) => !spot.auto || spot.fact); // drop found stops that ended up without an idea
    const yourStops = kept.filter((s) => walk.indexOf(s) < stopCount).length;
    // What didn't fit, so the UI can say how many more stops the notes need.
    p.fillReport = {
      ideas: ideas.length,
      yourStops,
      foundStops: stopCount - yourStops,
      waiting: ideas.slice(stopCount).map((idea) => idea.text),
    };
    // Fresh material: the first review is right away (see /reviews).
    p.reviews = [];
    p.nextReviewAt = new Date().toISOString();
  });
}
