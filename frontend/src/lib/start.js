import { api } from '../api.js';

// Shortcuts into the built-in palaces (made by `npm run seed-samples` in backend/).

// The main built-in route: the first one made (the Reitz Union).
export const firstBuiltIn = (palaces) =>
  palaces.filter((p) => p.builtIn).sort((a, b) => a.id - b.id)[0];

export const openPalace = (id, action) => { window.location.hash = `#/palace/${id}${action ? `/${action}` : ''}`; };

// "Start memorizing": your own copy of the built-in Reitz route, with the notes box open.
export async function startInBuiltIn(palaces) {
  const list = palaces ?? await api.listPalaces();
  const builtIn = firstBuiltIn(list);
  if (!builtIn) throw new Error('The built-in Reitz route isn’t set up on this server (run npm run seed-samples).');
  openPalace((await api.copyPalace(builtIn.id)).id, 'feed');
}

// The finished mitosis example, opened in Wander.
export async function openSample(palaces) {
  const list = palaces ?? await api.listPalaces();
  const sample = list.find((p) => p.sample);
  if (!sample) throw new Error('The sample palace isn’t set up on this server (run npm run seed-samples).');
  openPalace(sample.id, 'wander');
}
