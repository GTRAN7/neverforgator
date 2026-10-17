// Turn a palace into a shared template (or back), e.g. the UF campus route:
//   npm run make-template <palaceId>        → everyone can see it and start their own copy
//   npm run make-template <palaceId> off    → back to a normal palace
// Build it in the app first (rooms + spots along the route), then run this.
import { readPalace, updatePalace } from '../storage.js';

const [id, flag] = process.argv.slice(2);
const palace = id && await readPalace(id);
if (!palace) {
  console.error('Usage: npm run make-template <palaceId> [off]   (the id is in the URL: #/palace/<id>)');
  process.exit(1);
}
const template = flag !== 'off';
await updatePalace(id, (p) => { p.template = template; });
console.log(`${palace.name} (${id}) is ${template ? 'now a shared template' : 'no longer a template'}.`);
