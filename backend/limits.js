// Fair-use limits, so one user (or a stuck script) can't burn the whole Gemini budget.
//
// - Size caps: how much text / how big a file one request may send.
// - Daily quotas per user and action, e.g. 10 note scans a day. Counted in data/usage.json
//   (swap for Redis/Postgres with many servers), reset at midnight UTC.
// - A burst limit: at most 120 API requests a minute per user, kept in memory.
import fs from 'node:fs/promises';
import path from 'node:path';

export const CAPS = {
  notesChars: 20_000, // ≈ 5,000 tokens: a long textbook chapter
  ideaChars: 300, // one idea, edited by hand
  importBytes: 20 * 1024 * 1024, // Gemini takes up to 20 MB inline
};

export const DAILY = {
  fill: { limit: 20, label: 'palace fills' },
  import: { limit: 10, label: 'note scans and recordings' },
  scene: { limit: 60, label: 'rewritten scenes' },
  label: { limit: 200, label: 'stop names' },
  picture: { limit: 150, label: 'pictures' },
};

const FILE = path.join(import.meta.dirname, 'data', 'usage.json');
const today = () => new Date().toISOString().slice(0, 10);

let usage = null; // { day, counts: { userId: { action: n } } }
let saving = Promise.resolve();

async function load() {
  if (!usage) usage = JSON.parse(await fs.readFile(FILE, 'utf8').catch(() => 'null')) ?? { day: today(), counts: {} };
  if (usage.day !== today()) usage = { day: today(), counts: {} };
  return usage;
}

function save() {
  const snapshot = JSON.stringify(usage);
  saving = saving.then(() => fs.writeFile(FILE, snapshot)).catch(() => {});
}

// What's left today, for the UI: { fill: { used, limit, label }, ... }
export async function usageFor(userId) {
  const counts = (await load()).counts[userId] ?? {};
  return Object.fromEntries(Object.entries(DAILY).map(([action, { limit, label }]) =>
    [action, { used: counts[action] ?? 0, limit, label }]));
}

// Route middleware: counts one use of `action`, or answers 429 when today's quota is gone.
export function quota(action) {
  return async (req, res, next) => {
    const { counts } = await load();
    const mine = (counts[req.userId] ??= {});
    const { limit, label } = DAILY[action];
    if ((mine[action] ?? 0) >= limit) {
      return res.status(429).json({ error: `Daily limit reached: ${limit} ${label} a day. It resets at midnight UTC.` });
    }
    mine[action] = (mine[action] ?? 0) + 1;
    save();
    // A request that fails on our side shouldn't cost the user one of their uses.
    res.on('finish', () => {
      if (res.statusCode >= 500 || res.statusCode === 400) {
        mine[action] = Math.max(0, mine[action] - 1);
        save();
      }
    });
    next();
  };
}

// 120 requests a minute per user (sliding window of timestamps).
const recent = new Map();
export function burstLimit(req, res, next) {
  const now = Date.now();
  const times = (recent.get(req.userId) ?? []).filter((t) => now - t < 60_000);
  if (times.length >= 120) return res.status(429).json({ error: 'Slow down a little: too many requests this minute.' });
  times.push(now);
  recent.set(req.userId, times);
  next();
}
