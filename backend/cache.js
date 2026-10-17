// "Never pay twice": every Gemini result is saved to data/cache/ under a hash of
// its inputs (model + prompt + reference image). Same inputs → read from disk, no API call.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const CACHE_DIR = path.join(import.meta.dirname, 'data', 'cache');
await fs.mkdir(CACHE_DIR, { recursive: true });

const hash = (parts) =>
  crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24);

// If two requests ask for the same thing at the same moment, they share one API call.
const inFlight = new Map();
function once(key, produce) {
  if (!inFlight.has(key)) {
    inFlight.set(key, produce().finally(() => inFlight.delete(key)));
  }
  return inFlight.get(key);
}

export function cachedJson(parts, produce) {
  const file = path.join(CACHE_DIR, `${hash(parts)}.json`);
  return once(file, async () => {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {
      const value = await produce();
      await fs.writeFile(file, JSON.stringify(value));
      return value;
    }
  });
}

// produce() returns { buffer, ext }. Resolves to the file name, served at /cache/<name>.
export function cachedImage(parts, produce) {
  const base = hash(parts);
  return once(base, async () => {
    const existing = (await fs.readdir(CACHE_DIR)).find((f) => f.startsWith(`${base}.`));
    if (existing) return existing;
    const { buffer, ext } = await produce();
    const name = `${base}.${ext}`;
    await fs.writeFile(path.join(CACHE_DIR, name), buffer);
    return name;
  });
}
