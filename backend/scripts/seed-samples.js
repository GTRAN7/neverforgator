// Builds the two built-in palaces everyone sees, from a palace you made of the Reitz Union:
//   npm run seed-samples <reitzPalaceId>
//
// 1. "Reitz Union" (built in): the rooms and stops, no facts. "Start memorizing" gives each
//    user their own copy, so they can paste notes right away without taking any photos.
// 2. "Sample: the phases of mitosis": the same route already filled with a real study example,
//    pictures included. The onboarding tour opens it, and anyone can walk and quiz it (read-only).
// Both belong to "system", so users can't change or delete them. Run again to rebuild them.
import { readPalace, updatePalace, copyPalace, deletePalace, listPalaces } from '../storage.js';
import { fillPalace } from '../fill.js';
import * as gemini from '../gemini.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { palaceDir } from '../storage.js';

const MITOSIS_NOTES = `The phases of mitosis (how one cell splits into two identical cells), in order: P-M-A-T, then cytokinesis.
Prophase: the chromosomes condense into thick X shapes and the nuclear envelope breaks down.
Metaphase: the chromosomes line up single file across the middle of the cell (the metaphase plate).
Anaphase: spindle fibers pull the sister chromatids apart, toward opposite ends of the cell.
Telophase: two new nuclear envelopes form, one around each set of chromosomes.
Cytokinesis: the cytoplasm pinches in two, leaving two separate, identical daughter cells.`;

const sourceId = process.argv[2];
const source = sourceId && await readPalace(sourceId);
if (!source) {
  console.error('Usage: npm run seed-samples <reitzPalaceId>   (the id is in the URL: #/palace/<id>)');
  process.exit(1);
}
await gemini.chooseModels().catch(() => {
  gemini.models.text ||= 'gemini-2.5-flash';
});

// Remove the previous built-ins.
for (const p of await listPalaces('system')) {
  const full = await readPalace(p.id);
  if (full.owner === 'system' && (full.builtIn || full.sample)) await deletePalace(p.id);
}

const route = await copyPalace(source, 'system');
await updatePalace(route.id, (p) => {
  Object.assign(p, { name: 'Reitz Union', template: true, builtIn: true });
});
console.log(`Built-in route: Reitz Union (${route.id}), ${route.spots.length} stops, ${route.rooms.length} rooms`);

const sample = await copyPalace(await readPalace(route.id), 'system');
await updatePalace(sample.id, (p) => {
  Object.assign(p, { name: 'Sample: the phases of mitosis', template: true, sample: true });
});
console.log('Filling the sample with the mitosis notes…');
const filled = await fillPalace(await readPalace(sample.id), MITOSIS_NOTES, 'sticker');
for (const spot of filled.spots.filter((s) => s.imagePrompt)) {
  const crop = spot.crop ? await fs.readFile(path.join(palaceDir(sample.id), spot.crop)).catch(() => null) : null;
  const image = await gemini.generateImage(spot.imagePrompt, crop, 'sticker');
  await updatePalace(sample.id, (p) => { p.spots.find((s) => s.id === spot.id).image = image; });
  console.log(`  ${spot.label}: ${spot.fact}`);
}
console.log(`Sample: ${sample.id}. Done.`);
