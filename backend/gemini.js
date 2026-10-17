// Everything that talks to Gemini lives here. This is the only file that reads the API key.
// With no key set, MOCK mode returns simple placeholder results so the app still works offline.
import { GoogleGenAI } from '@google/genai';
import { cachedJson, cachedImage } from './cache.js';
import { placeholderImage } from './placeholder.js';

const apiKey = process.env.GEMINI_API_KEY;
export const MOCK = !apiKey;
// How stops get pictures (PICTURES in .env):
//   doodle (default)  Gemini's text model draws a little SVG of the scene: cheap, works on the free tier
//   gemini            real generated images (needs billing on the Google Cloud project)
//   placeholder       a free SVG sketch card, no API call
export const PICTURES = MOCK ? 'placeholder' : (['gemini', 'placeholder'].includes(process.env.PICTURES) ? process.env.PICTURES : 'doodle');
const ai = MOCK ? null : new GoogleGenAI({ apiKey });

// ---- Model choice ----
// Model names change often. Unless .env names one, ask Google which models this
// key can use and pick the newest "flash" text model and "flash-image" model.
export const models = { text: process.env.GEMINI_TEXT_MODEL, image: process.env.GEMINI_IMAGE_MODEL };

export async function chooseModels() {
  if (MOCK || (models.text && models.image)) return models;
  const names = [];
  for await (const m of await ai.models.list()) names.push(m.name.replace(/^models\//, ''));
  const newest = (pattern) =>
    names.filter((n) => pattern.test(n)).sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))[0];
  models.text ||= newest(/^gemini-[\d.]+-flash$/) ?? 'gemini-2.5-flash';
  models.image ||= newest(/^gemini-[\d.]+-flash-image$/) ?? 'gemini-2.5-flash-image';
  return models;
}

// ---- Low-level helpers ----

// Retry on rate limits / "high demand" hiccups / hung calls (after 2 s, then 5 s), because a
// single 503 shouldn't kill the demo. Every call gets a deadline so a stuck request can't hang forever.
const TIMEOUT_MS = 40_000;

async function withRetry(call) {
  for (const wait of [2000, 5000, null]) {
    try {
      return await call(AbortSignal.timeout(TIMEOUT_MS));
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') err.status = 504;
      if (![429, 500, 503, 504].includes(err.status) || wait === null) throw readable(err);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// Gemini errors arrive as a JSON blob in err.message; pull out the human part.
function readable(err) {
  let message = err.message;
  try { message = JSON.parse(err.message).error.message; } catch { /* already plain text */ }
  return Object.assign(new Error(`Gemini: ${message}`), { status: 502 });
}

const imagePart = (image, mimeType = 'image/jpeg') => ({ inlineData: { mimeType, data: image.toString('base64') } });

// Ask for JSON that matches `schema`; Gemini guarantees the shape.
async function generateJson(prompt, schema, image, mimeType) {
  const contents = image ? [imagePart(image, mimeType), { text: prompt }] : prompt;
  const res = await withRetry((abortSignal) => ai.models.generateContent({
    model: models.text,
    contents,
    config: { responseMimeType: 'application/json', responseJsonSchema: schema, abortSignal },
  }));
  return JSON.parse(res.text);
}

// ---- 1. Name what the user clicked on ----

export async function labelSpot(crop) {
  if (MOCK || !crop) return null;
  const result = await generateJson(
    `This is a crop of a photo of someone's room, centered on a spot they clicked.
Name the single object or place at the center in 1-4 lowercase words, like "desk lamp" or "window sill".`,
    { type: 'object', properties: { label: { type: 'string' } }, required: ['label'] },
    crop,
  );
  return result.label.trim().slice(0, 40);
}

// ---- 2. Notes → ideas → one bizarre scene per stop ----
// Done the way memory athletes do it: first cut the material into "one image" chunks,
// then give each chunk its own stop, then turn it into a vivid scene that touches that stop,
// using the classic technique for that kind of information (numbers, names, lists...).

export const MAX_IDEAS = 40;

const IDEA_KINDS = ['definition', 'fact', 'number', 'date', 'name', 'list', 'sequence', 'formula', 'vocabulary', 'cause-effect', 'comparison'];

// The classic "number rhyme" pegs: each digit always becomes the same image.
const NUMBER_RHYMES = '0 = hero, 1 = bun, 2 = shoe, 3 = tree, 4 = door, 5 = hive, 6 = sticks, 7 = heaven (an angel), 8 = gate, 9 = wine';

const PEGS = ['hero', 'bun', 'shoe', 'tree', 'door', 'hive', 'sticks', 'heaven (an angel)', 'gate', 'wine'];

// The digit images for the numbers in an idea, worked out here so the model only has to use them:
// "Hans Krebs found it in 1937" → '1937 = bun, wine, tree, heaven (an angel)'.
function numberPegs(text) {
  const numbers = [...new Set(text.match(/\b\d{1,4}\b/g) ?? [])];
  return numbers.map((n) => `${n} = ${[...n].map((d) => PEGS[d]).join(', ')}`).join('; ');
}

// The memory technique for each kind of idea. Gemini gets the ones it needs.
const TECHNIQUES = {
  definition: 'Turn the term into a sound-alike image (the hook) and make that image physically DO the meaning.',
  fact: 'Turn every key word into a concrete object or character and make them interact in one action.',
  number: `Turn each digit into its number-rhyme image, exactly this table: ${NUMBER_RHYMES}.
Show those images in order in the scene (e.g. 23 → a SHOE kicking a TREE).`,
  date: `Encode the digits of the year/day with exactly this number-rhyme table: ${NUMBER_RHYMES}, in order, acting with the event.`,
  name: 'Replace the person or place name with a sound-alike image (e.g. Darwin → a DART that keeps WINNING) doing their deed.',
  vocabulary: 'Keyword method: a sound-alike of the word (in your language) interacting with an image of its meaning.',
  list: 'Each item becomes its own character, all crowded into one scene in the right order (left to right).',
  sequence: 'Show the steps as a chain reaction in order: the first step causes the second, and so on.',
  formula: 'Variables become characters, operations become actions (multiply = rabbits breeding, divide = chopping, squared = stuffed into a box).',
  'cause-effect': 'The cause must physically CAUSE the effect in the scene, as a dramatic action.',
  comparison: 'Two characters show the contrast side by side, exaggerating the difference.',
};

const SCENE_RULES = `A great memory scene:
- happens AT that exact location and touches the object (sits on it, breaks it, crawls out of it),
- is bizarre, exaggerated, funny or gross, with motion, sound and smell, and YOU are in it,
- makes every key term recoverable: abstract or unfamiliar words become concrete sound-alike images,
- uses the technique for its kind of idea (given per stop),
- shows every image named in the hook (the hook is the key to the scene, so it must be IN the scene),
- is 2-3 short sentences, present tense, second person ("you see...").
hook: the sound-alike or symbol for the hardest word(s), as "word → image" (e.g. "allele → bowling alley"). Invent fresh images; don't reuse the examples.
imagePrompt: the same scene described visually in one paragraph (subject, action, the object, lighting). No text in the image.`;

const IDEA_SCHEMA = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          kind: { type: 'string', enum: IDEA_KINDS },
          keyTerms: { type: 'array', items: { type: 'string' } },
        },
        required: ['text', 'kind', 'keyTerms'],
      },
    },
  },
  required: ['ideas'],
};

// How many stops do these notes need? One per idea, where an idea is what fits in one picture.
// Returns [{ text, kind, keyTerms }].
export function splitNotes(notes) {
  return cachedJson(['split-v3', models.text, notes], async () => {
    if (MOCK) return mockSplit(notes);
    const result = await generateJson(
      `You coach memory athletes. A student will store these notes in a memory palace, one idea per stop.

Notes:
"""
${notes}
"""

Cut the notes into ideas. Each idea is ONE short, self-contained sentence a teacher could quiz on,
small enough to picture as a single scene: a term and its meaning, a cause and its effect, a name and
what they did, a number and what it counts.
- Split long lists (more than 4 items) and multi-part definitions into separate ideas, in order.
- Keep exact numbers, dates, names, units and formulas. Never invent facts that aren't in the notes.
- Skip headings, filler and repeats. Keep the order of the notes.
- Use as many ideas as the notes really need (a few lines: a few ideas; a chapter: many), at most ${MAX_IDEAS}.
  If there is more than that, keep the ${MAX_IDEAS} most important.
For each idea also give:
- kind: ${IDEA_KINDS.join(', ')}
- keyTerms: the 1-4 words or numbers a correct answer must contain (e.g. ["mitochondria", "ATP"]).`,
      IDEA_SCHEMA,
    );
    return result.ideas.slice(0, MAX_IDEAS);
  });
}

// One scene per idea, idea i at location i. Written in batches of 5 at the same time, which is
// much faster than one long answer. Each batch is cached on its own, so adding stops at the end
// of the path and filling again only writes the new ones.
const SCENE_BATCH = 5;

export async function writeScenes(ideas, locations) {
  const batches = [];
  for (let start = 0; start < ideas.length; start += SCENE_BATCH) {
    const end = start + SCENE_BATCH;
    batches.push(writeSceneBatch(ideas.slice(start, end), locations.slice(start, end))
      .then((items) => items.map((item) => ({ ...item, location: item.location + start }))));
  }
  return (await Promise.all(batches)).flat();
}

function writeSceneBatch(ideas, locations) {
  return cachedJson(['scenes-v5', models.text, ideas, locations], async () => {
    if (MOCK) return mockScenes(ideas, locations);
    const list = ideas.map((idea, i) => {
      const pegs = numberPegs(idea.text);
      return `${i + 1}. At "${locations[i]}" (${idea.kind}; key terms: ${idea.keyTerms.join(', ')}${pegs ? `; number images to use, in order: ${pegs}` : ''}): ${idea.text}`;
    }).join('\n');
    const kinds = [...new Set(ideas.map((idea) => idea.kind))];
    const techniques = kinds.map((kind) => `- ${kind}: ${TECHNIQUES[kind] ?? TECHNIQUES.fact}`).join('\n');
    const result = await generateJson(
      `You help a student build a memory palace (method of loci) in a real place they know.
Here is part of their walking path, with the idea stored at each stop:
${list}

Techniques by kind of idea:
${techniques}

For each stop write a scene, a hook and an imagePrompt.

${SCENE_RULES}`,
      {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                location: { type: 'integer' },
                scene: { type: 'string' },
                hook: { type: 'string' },
                imagePrompt: { type: 'string' },
              },
              required: ['location', 'scene', 'hook', 'imagePrompt'],
            },
          },
        },
        required: ['items'],
      },
    );
    return result.items;
  });
}

// ---- 2a. Notes from a photo, PDF or voice recording ----

export function extractNotes(file, mimeType, fileHash) {
  return cachedJson(['extract', models.text, fileHash], async () => {
    if (MOCK) return { text: 'Mock mode: imagine the notes from your file here.\nAdd a GEMINI_API_KEY to read real files.' };
    const audio = mimeType.startsWith('audio/') || mimeType === 'video/webm';
    const prompt = audio
      ? `A student is talking about what they need to remember. Turn the recording into clean study notes:
one fact per line, in the order spoken. Drop filler ("um", "so basically"), repeats and off-topic talk,
keep every name, number, date and definition exactly. If the recording has no study content, return an empty text.`
      : `This is a student's study material (a photo of notes, slides, a textbook page or a PDF).
Transcribe it as clean study notes: one fact per line, in reading order. Keep every name, number, date,
formula and definition exactly; fix obvious OCR mistakes; skip page numbers, headers and decoration.
Describe diagrams in one line each. If there is no study content, return an empty text.`;
    return generateJson(prompt, { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }, file, mimeType);
  });
}

// ---- 2b. Find good stops in a panorama (to build the palace automatically) ----
// Returns [{ label, x, y }] with x, y from 0 to 1000 in the photo. Cached per photo,
// so each room is only ever looked at once.

export function findStops(photo, mimeType, photoKey) {
  return cachedJson(['stops', models.text, photoKey], async () => {
    if (MOCK) return mockStops();
    const result = await generateJson(
      `This is a wide panorama photo of a real place, going all the way around the viewer.
Pick up to 24 distinct, easy-to-recognize objects or spots where someone could imagine a memorable scene
happening: furniture, signs, doors, windows, art, plants, equipment. Spread them across the whole width
of the photo. Skip people and anything tiny or blurry.
For each: a short name (1-4 lowercase words, like "chess set" or "red armchair") and the point at its
center, as x (left to right) and y (top to bottom), each from 0 to 1000.`,
      {
        type: 'object',
        properties: {
          stops: {
            type: 'array',
            items: {
              type: 'object',
              properties: { label: { type: 'string' }, x: { type: 'integer' }, y: { type: 'integer' } },
              required: ['label', 'x', 'y'],
            },
          },
        },
        required: ['stops'],
      },
      photo,
      mimeType,
    );
    return result.stops;
  });
}

// ---- 3. A missed spot gets a weirder scene ----

export function weirderScene({ fact, kind = 'fact', label, scene, level }) {
  return cachedJson(['weirder-v4', models.text, fact, kind, label, scene, level], async () => {
    if (MOCK) return mockWeirder(fact, label, level);
    return generateJson(
      `A student forgot this fact during a memory-palace quiz:
Fact: ${fact}
Location in their room: ${label}
The scene that didn't stick: ${scene}

Write a NEW scene at the same location that is far weirder and more vivid (weirdness level ${level} of 5):
more absurd, bigger, louder, more emotional, more personal. Use a DIFFERENT hook than before and make the
key words impossible to miss. Technique for this kind of idea (${kind}): ${TECHNIQUES[kind] ?? TECHNIQUES.fact}

${SCENE_RULES}`,
      {
        type: 'object',
        properties: { scene: { type: 'string' }, hook: { type: 'string' }, imagePrompt: { type: 'string' } },
        required: ['scene', 'hook', 'imagePrompt'],
      },
    );
  });
}

// ---- 4. A picture per stop (cached) ----

export const PICTURE_STYLES = {
  storybook: 'a warm storybook illustration, soft watercolor and ink',
  claymation: 'a claymation scene, handmade plasticine figures, stop-motion look',
  sticker: 'a cute die-cut sticker illustration, bold outlines, flat bright colors',
  pixel: 'detailed 16-bit pixel art',
};

export function generateImage(prompt, crop, style = 'storybook') {
  const placeholder = () => cachedImage(['placeholder-v2', style, prompt], async () => placeholderImage(prompt, style));
  if (PICTURES === 'placeholder') return placeholder();
  // Doodles cost one cheap text call. If Gemini is busy or out of quota, fall back to the sketch card.
  if (PICTURES === 'doodle') return generateDoodle(prompt, style).catch(placeholder);
  return generateRealImage(prompt, crop, style);
}

// When we have a crop of the real room, Gemini edits that photo, so the scene
// appears in the user's actual room, not a generic one.
function generateRealImage(prompt, crop, style) {
  const look = PICTURE_STYLES[style] ?? PICTURE_STYLES.storybook;
  return cachedImage(['image', models.image, style, prompt, crop?.toString('base64') ?? null], async () => {
    const text = crop
      ? `This photo shows a spot in my room. Redraw it as ${look}, with this scene happening right
there and the room still recognizable. Vivid and funny, no text. Scene: ${prompt}`
      : `${look}, vivid and funny, no text. Scene: ${prompt}`;
    const res = await withRetry((abortSignal) => ai.models.generateContent({
      model: models.image,
      contents: crop ? [imagePart(crop), { text }] : text,
      config: { abortSignal },
    }));
    const image = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    if (!image) throw Object.assign(new Error('Gemini returned no image (it may have been blocked). Try again.'), { status: 502 });
    return { buffer: Buffer.from(image.data, 'base64'), ext: image.mimeType.split('/')[1] || 'png' };
  });
}

// A doodle: the text model writes a small SVG drawing of the scene.
const DOODLE_LOOK = {
  storybook: 'soft pastel fills',
  claymation: 'rounded blobby shapes with soft shading, like clay',
  sticker: 'bright flat colors with a thick white outline around each figure, like stickers',
  pixel: 'chunky square pixels only (rects on a grid), shape-rendering="crispEdges"',
};

function generateDoodle(prompt, style) {
  return cachedImage(['doodle-v1', models.text, style, prompt], async () => {
    const res = await withRetry((abortSignal) => ai.models.generateContent({
      model: models.text,
      contents: `Draw this scene as a playful cartoon doodle in SVG.
Scene: ${prompt}

Rules: one <svg> element with xmlns="http://www.w3.org/2000/svg" and viewBox="0 0 768 468".
A simple background (floor + wall or sky), then 2-4 big, recognizable characters or objects doing the action.
Thick dark outlines (#3B2A1E, stroke-width 5), ${DOODLE_LOOK[style] ?? DOODLE_LOOK.storybook}, expressive faces.
Only basic shapes and paths. No text, no <script>, no <image>, no external links, no animation. Under 8 KB.
Answer with the SVG only.`,
      config: { abortSignal },
    }));
    const svg = cleanSvg(res.text ?? '');
    if (!svg) throw new Error('No drawing came back');
    return { buffer: Buffer.from(svg), ext: 'svg' };
  });
}

// Keep only a plain drawing: no scripts, event handlers, links or embedded content.
// (The SVG is shown in <img> tags, where scripts can't run anyway, but someone could open it directly.)
function cleanSvg(text) {
  const svg = /<svg[\s\S]*<\/svg>/i.exec(text)?.[0];
  if (!svg || svg.length > 60_000) return null;
  return svg
    .replace(/<(script|foreignObject|iframe|image|use|a|style)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|foreignObject|iframe|image|use|a|style)\b[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|xlink:href)\s*=\s*("[^"]*"|'[^']*')/gi, '');
}

// ---- Mock mode (no API key) ----

function mockSplit(notes) {
  return notes
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((s) => s.length > 8 && !s.endsWith(':')) // skip headings
    .slice(0, MAX_IDEAS)
    .map((text) => ({ text, kind: 'fact', keyTerms: text.split(/\W+/).filter((w) => w.length > 5).slice(0, 2) }));
}

function mockScenes(ideas, locations) {
  return ideas.map((idea, i) => ({
    location: i + 1,
    scene: `At the ${locations[i]}, a giant talking hamster shouts "${idea.text}" while juggling flaming pineapples.`,
    hook: 'hamster → shouting the fact',
    imagePrompt: `A giant hamster juggling flaming pineapples next to a ${locations[i]}`,
  }));
}

function mockStops() {
  return Array.from({ length: 10 }, (_, i) => ({ label: `spot ${String.fromCharCode(65 + i)}`, x: 50 + i * 100, y: 500 }));
}

function mockWeirder(fact, label, level) {
  return {
    scene: `At the ${label}, ${level + 1} singing octopuses in tuxedos tattoo "${fact}" onto a dancing elephant.`,
    hook: 'octopus tattoo → the fact',
    imagePrompt: `Singing octopuses in tuxedos and a dancing elephant at a ${label} (weirdness ${level})`,
  };
}
