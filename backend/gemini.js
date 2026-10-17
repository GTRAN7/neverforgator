// Everything that talks to Gemini lives here. This is the only file that reads the API key.
// With no key set, MOCK mode returns simple placeholder results so the app still works offline.
import { GoogleGenAI } from '@google/genai';
import { cachedJson, cachedImage } from './cache.js';
import { placeholderImage } from './placeholder.js';

const apiKey = process.env.GEMINI_API_KEY;
export const MOCK = !apiKey;
// PICTURES=placeholder (default): Gemini writes everything, but pictures are free SVG sketches.
// PICTURES=gemini: real generated images (needs billing on the Google Cloud project).
export const PLACEHOLDER_PICTURES = MOCK || process.env.PICTURES !== 'gemini';
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

// Retry once on rate limits / server hiccups, because a single 503 shouldn't kill the demo.
async function withRetry(call) {
  try {
    return await call();
  } catch (err) {
    if (![429, 500, 503].includes(err.status)) throw readable(err);
    await new Promise((r) => setTimeout(r, 2000));
    return call().catch((retryErr) => { throw readable(retryErr); });
  }
}

// Gemini errors arrive as a JSON blob in err.message; pull out the human part.
function readable(err) {
  let message = err.message;
  try { message = JSON.parse(err.message).error.message; } catch { /* already plain text */ }
  return Object.assign(new Error(`Gemini: ${message}`), { status: 502 });
}

const imagePart = (image) => ({ inlineData: { mimeType: 'image/jpeg', data: image.toString('base64') } });

// Ask for JSON that matches `schema`; Gemini guarantees the shape.
async function generateJson(prompt, schema, image) {
  const contents = image ? [imagePart(image), { text: prompt }] : prompt;
  const res = await withRetry(() => ai.models.generateContent({
    model: models.text,
    contents,
    config: { responseMimeType: 'application/json', responseJsonSchema: schema },
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

// ---- 2. Notes → one fact + one bizarre scene per spot ----

const SCENE_RULES = `A great memory scene:
- happens physically AT that exact location in the student's room,
- is bizarre, exaggerated, funny or gross, full of motion, sound and smell,
- encodes the KEY WORDS of the fact so the fact can be recovered from the scene,
- is 2-3 short sentences, present tense, second person ("you see...").
The imagePrompt describes the same scene visually for an image model in one paragraph:
subject, action, the room object, lighting. No text or letters in the image.`;

export function fillSpots(notes, locations) {
  return cachedJson(['fill', models.text, notes, locations], async () => {
    if (MOCK) return mockFill(notes, locations);
    const list = locations.map((name, i) => `${i + 1}. ${name}`).join('\n');
    const result = await generateJson(
      `You help a student build a memory palace (method of loci).

Their walking path through their own room has ${locations.length} locations, in order:
${list}

Their study notes:
"""
${notes}
"""

1. Split the notes into the ${locations.length} most important self-contained facts (fewer if the notes are short).
   Each fact is one short sentence a teacher could quiz on. Keep the order of the notes.
2. Assign facts to locations in order: fact 1 → location 1, and so on.
3. For each, write a scene and an imagePrompt.

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
                fact: { type: 'string' },
                scene: { type: 'string' },
                imagePrompt: { type: 'string' },
              },
              required: ['location', 'fact', 'scene', 'imagePrompt'],
            },
          },
        },
        required: ['items'],
      },
    );
    return result.items;
  });
}

// ---- 3. A missed spot gets a weirder scene ----

export function weirderScene({ fact, label, scene, level }) {
  return cachedJson(['weirder', models.text, fact, label, scene, level], async () => {
    if (MOCK) return mockWeirder(fact, label, level);
    return generateJson(
      `A student forgot this fact during a memory-palace quiz:
Fact: ${fact}
Location in their room: ${label}
The scene that didn't stick: ${scene}

Write a NEW scene at the same location that is far weirder and more vivid (weirdness level ${level} of 5):
more absurd, bigger, louder, more emotional, more personal. Make the key words impossible to miss.

${SCENE_RULES}`,
      {
        type: 'object',
        properties: { scene: { type: 'string' }, imagePrompt: { type: 'string' } },
        required: ['scene', 'imagePrompt'],
      },
    );
  });
}

// ---- 4. Grade a quiz answer ----

export function gradeAnswer(fact, answer) {
  return cachedJson(['grade', models.text, fact, answer], async () => {
    if (MOCK) return mockGrade(fact, answer);
    return generateJson(
      `Fact: ${fact}
Student's answer from memory: ${answer}

Did the student recall the key information of the fact? Be lenient about wording, spelling and
minor details, strict about wrong or missing key facts (names, numbers, cause/effect).
feedback: one short, friendly sentence. If wrong or incomplete, say what the key info is.`,
      {
        type: 'object',
        properties: { correct: { type: 'boolean' }, feedback: { type: 'string' } },
        required: ['correct', 'feedback'],
      },
    );
  });
}

// ---- 5. Image per spot (cached) ----
// When we have a crop of the real room, Gemini edits that photo, so the scene
// appears in the user's actual room, not a generic one.

export const PICTURE_STYLES = {
  storybook: 'a warm storybook illustration, soft watercolor and ink',
  claymation: 'a claymation scene, handmade plasticine figures, stop-motion look',
  sticker: 'a cute die-cut sticker illustration, bold outlines, flat bright colors',
  pixel: 'detailed 16-bit pixel art',
};

export function generateImage(prompt, crop, style = 'storybook') {
  const look = PICTURE_STYLES[style] ?? PICTURE_STYLES.storybook;
  if (PLACEHOLDER_PICTURES) {
    return cachedImage(['placeholder-v2', style, prompt], async () => placeholderImage(prompt, style));
  }
  return cachedImage(['image', models.image, style, prompt, crop?.toString('base64') ?? null], async () => {
    const text = crop
      ? `This photo shows a spot in my room. Redraw it as ${look}, with this scene happening right
there and the room still recognizable. Vivid and funny, no text. Scene: ${prompt}`
      : `${look}, vivid and funny, no text. Scene: ${prompt}`;
    const res = await withRetry(() => ai.models.generateContent({
      model: models.image,
      contents: crop ? [imagePart(crop), { text }] : text,
    }));
    const image = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    if (!image) throw Object.assign(new Error('Gemini returned no image (it may have been blocked). Try again.'), { status: 502 });
    return { buffer: Buffer.from(image.data, 'base64'), ext: image.mimeType.split('/')[1] || 'png' };
  });
}

// ---- Mock mode (no API key) ----

function mockFill(notes, locations) {
  const facts = notes
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((s) => s.length > 8 && !s.endsWith(':')) // skip headings
    .slice(0, locations.length);
  return facts.map((fact, i) => ({
    location: i + 1,
    fact,
    scene: `At the ${locations[i]}, a giant talking hamster shouts "${fact}" while juggling flaming pineapples.`,
    imagePrompt: `A giant hamster juggling flaming pineapples next to a ${locations[i]}`,
  }));
}

function mockWeirder(fact, label, level) {
  return {
    scene: `At the ${label}, ${level + 1} singing octopuses in tuxedos tattoo "${fact}" onto a dancing elephant.`,
    imagePrompt: `Singing octopuses in tuxedos and a dancing elephant at a ${label} (weirdness ${level})`,
  };
}

function mockGrade(fact, answer) {
  const words = (s) => new Set(s.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);
  const key = words(fact);
  const hits = [...words(answer)].filter((w) => key.has(w)).length;
  const correct = key.size > 0 && hits / key.size >= 0.4;
  return { correct, feedback: correct ? 'Nice, you got it!' : `Not quite. The fact was: ${fact}` };
}
