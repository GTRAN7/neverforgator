"""Everything that talks to Gemini lives here. This is the only file that uses the API key.
With no key set, MOCK mode returns simple placeholder results so the app still works offline.

Every result is cached (cache.py), so the same notes, photo or scene never cost twice."""
import json
import logging
import random
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from app import config
from app.studio.cache import cached_image, cached_json, lookup_image, lookup_json, store_image, store_json
from app.studio.placeholder import placeholder_image

log = logging.getLogger("loci.gemini")

MOCK = not config.GEMINI_API_KEY
# How stops get pictures: doodle (default), gemini (real images, needs billing) or placeholder.
PICTURES = "placeholder" if MOCK else (config.PICTURES if config.PICTURES in ("gemini", "placeholder") else "doodle")
TIMEOUT_MS = 40_000  # a stuck call can't hang a request forever

_client = None
if not MOCK:
    from google import genai
    from google.genai import errors, types

    _client = genai.Client(api_key=config.GEMINI_API_KEY, http_options=types.HttpOptions(timeout=TIMEOUT_MS))

# ---- Model choice ----
# Model names change often. Unless .env names one, ask Google which models this key can use and
# pick the newest "flash-lite" text model (it has by far the biggest free quota; the bigger "flash"
# models allow only ~20 requests a day, which one palace fill can nearly use up) and the newest
# "flash-image" model.
models = {"text": config.GEMINI_TEXT_MODEL, "image": config.GEMINI_IMAGE_MODEL, "backup": None}


def choose_models():
    """Also picks a backup text model: when the main one is overloaded ("high demand" 503s, which
    happen a lot), calls go to the backup instead of failing."""
    if MOCK:
        return models
    try:
        names = [m.name.removeprefix("models/") for m in _client.models.list()]
    except Exception as err:  # offline, bad key...: fall back to known names
        log.warning("Could not list Gemini models: %s", err)
        names = []

    def newest(pattern):
        found = [n for n in names if re.fullmatch(pattern, n)]
        key = lambda n: [int(p) if p.isdigit() else p for p in re.split(r"(\d+)", n)]
        return max(found, key=key) if found else None

    models["text"] = (models["text"] or newest(r"gemini-[\d.]+-flash-lite") or newest(r"gemini-[\d.]+-flash")
                      or "gemini-2.5-flash-lite")
    models["image"] = models["image"] or newest(r"gemini-[\d.]+-flash-image") or "gemini-2.5-flash-image"
    lites = sorted((n for n in names if re.fullmatch(r"gemini-[\d.]+-flash-lite", n) and n != models["text"]),
                   key=lambda n: [int(p) if p.isdigit() else p for p in re.split(r"(\d+)", n)])
    models["backup"] = lites[-1] if lites else None
    return models


# ---- Low-level helpers ----

class GeminiError(Exception):
    """A Gemini call failed; the message is safe to show the user."""
    status = 502


def _readable(err) -> GeminiError:
    message = getattr(err, "message", None) or str(err)
    return GeminiError(f"Gemini: {message}")


def _busy(err) -> bool:
    """Gemini overloaded, rate-limited or too slow: worth retrying (or trying the backup model)."""
    code = getattr(err, "code", None)
    timed_out = "timeout" in type(err).__name__.lower() or "timed out" in str(err).lower() or "deadline" in str(err).lower()
    return timed_out or code in (429, 500, 503, 504)


# At most this many Gemini calls at once, from the whole server. Bursts (a fill plus a few pictures
# plus someone's quiz) are what trigger "high demand" 503s and per-minute limits; queuing them a
# little is much better than failing.
_gate = threading.BoundedSemaphore(3)
_busy_until: dict[str, float] = {}  # model -> when to try it again after it was overloaded


def _with_retry(call, model: str | None = None, backup: str | None = None):
    """call(model) -> response. When Gemini is busy, switches to the backup model (and stays on it for
    a minute), retrying after ~2 s and ~5 s; the jitter keeps parallel retries from landing at once.
    Without a backup it retries the same model. A "high demand" spell shouldn't stop the demo."""
    attempts = [(model, 1), (backup, 2), (backup, 5), (model, None)] if backup else [(model, 2), (model, 5), (model, 10), (model, None)]
    if backup and _busy_until.get(model, 0) > time.monotonic():
        attempts = [(backup, 2), (backup, 5), (model, None)]  # it was just busy: go straight to the backup
    for which, wait in attempts:
        try:
            with _gate:
                return call(which)
        except Exception as err:
            if wait is None or not _busy(err):
                raise _readable(err) from err
            if backup and which == model:
                _busy_until[model] = time.monotonic() + 60  # skip it for a minute
                log.info("Gemini %s is busy (%s), using %s for a minute", model, getattr(err, "code", err), backup)
            time.sleep(wait + random.random())


def _image_part(data: bytes, mime_type: str = "image/jpeg"):
    return types.Part.from_bytes(data=data, mime_type=mime_type)


def _generate_json(prompt: str, schema: dict, image: bytes | None = None, mime_type: str = "image/jpeg"):
    """Ask for JSON that matches `schema`; Gemini guarantees the shape."""
    contents = [_image_part(image, mime_type), prompt] if image else prompt
    res = _with_retry(lambda model: _client.models.generate_content(
        model=model,
        contents=contents,
        config=types.GenerateContentConfig(response_mime_type="application/json", response_json_schema=schema),
    ), models["text"], models["backup"])
    return json.loads(res.text)


def _obj(**props):
    return {"type": "object", "properties": props, "required": list(props)}


STRING = {"type": "string"}


# ---- 1. Name what the user clicked on ----

def label_spot(crop: bytes):
    if MOCK or not crop:
        return None
    result = _generate_json(
        """This is a crop of a photo of someone's room, centered on a spot they clicked.
Name the single object or place at the center in 1-4 lowercase words, like "desk lamp" or "window sill".""",
        _obj(label=STRING),
        crop,
    )
    return result["label"].strip()[:40]


# ---- 2. Notes -> ideas -> one bizarre scene per stop ----
# Done the way memory athletes do it: first cut the material into "one image" chunks, then give
# each chunk its own stop, then turn it into a vivid scene that touches that stop, using the
# classic technique for that kind of information (numbers, names, lists...).

MAX_IDEAS = 40
IDEA_KINDS = ["definition", "fact", "number", "date", "name", "list", "sequence", "formula",
              "vocabulary", "cause-effect", "comparison"]

# The classic "number rhyme" pegs: each digit always becomes the same image.
PEGS = ["hero", "bun", "shoe", "tree", "door", "hive", "sticks", "heaven (an angel)", "gate", "wine"]
NUMBER_RHYMES = ", ".join(f"{d} = {peg}" for d, peg in enumerate(PEGS))


def number_pegs(text: str) -> str:
    """The digit images for the numbers in an idea, worked out here so the model only has to use
    them: "Hans Krebs found it in 1937" -> '1937 = bun, wine, tree, heaven (an angel)'."""
    # Plain numbers and ordinals ("4th Amendment" -> 4 = door).
    numbers = list(dict.fromkeys(re.findall(r"\b(\d{1,4})(?:st|nd|rd|th)?\b", text)))
    return "; ".join(f"{n} = {', '.join(PEGS[int(d)] for d in n)}" for n in numbers)


# The memory technique for each kind of idea. Gemini gets the ones it needs.
TECHNIQUES = {
    "definition": "Turn the term into a sound-alike image (the hook) and make that image physically DO the meaning.",
    "fact": "Turn every key word into a concrete object or character and make them interact in one action.",
    "number": f"Turn each digit into its number-rhyme image, exactly this table: {NUMBER_RHYMES}.\n"
              "Show those images in order in the scene (e.g. 23 → a SHOE kicking a TREE).",
    "date": f"Encode the digits of the year/day with exactly this number-rhyme table: {NUMBER_RHYMES}, in order, acting with the event.",
    "name": "Replace the person or place name with a concrete sound-alike image (e.g. Darwin → a DART that keeps WINNING) doing their deed; the sound-alike is the star of the scene, not the person.",
    "vocabulary": "Keyword method: a sound-alike of the word (in your language) interacting with an image of its meaning.",
    "list": "Each item becomes its own character, all crowded into one scene in the right order (left to right).",
    "sequence": "Show the steps as a chain reaction in order: the first step causes the second, and so on.",
    "formula": "Variables become characters, operations become actions (multiply = rabbits breeding, divide = chopping, squared = stuffed into a box).",
    "cause-effect": "The cause must physically CAUSE the effect in the scene, as a dramatic action.",
    "comparison": "Two characters show the contrast side by side, exaggerating the difference.",
}

# How far scenes may go (the user's "How weird?" preference).
FLAVORS = {
    "wild": "bizarre, exaggerated, funny or even gross",
    "silly": "silly, cartoonish and playful, never gross or scary",
    "clean": "vivid and funny but classroom-safe: no violence, gore, gross-out jokes or innuendo",
}


def scene_rules(flavor: str = "silly") -> str:
    return f"""A great memory scene:
- happens AT that exact location and touches the object (sits on it, breaks it, crawls out of it),
- is {FLAVORS.get(flavor, FLAVORS['silly'])}, with motion and sound, and YOU are in it,
- makes every key term recoverable: abstract or unfamiliar words become concrete sound-alike images,
- STAYS ON TOPIC: build images from the idea's own subject first (mitochondria → a tiny power plant,
  ATP → glowing batteries, a court case → a judge's gavel) or things that naturally belong with it.
  Use a sound-alike only for a word with no natural picture, and choose one that still fits the topic or
  the place. Don't fill the scene with random objects that have nothing to do with the idea,
- uses the technique for its kind of idea (given per stop),
- shows every image named in the hook (the hook is the key to the scene, so it must be IN the scene),
- number images come ON TOP of the key terms, never instead of them: the main subject (the planet, the
  person, the amendment's right) must still be clearly in the scene,
- is SHORT: 1-2 sentences, at most 30 words, present tense, second person ("you see..."). Every word must earn its place.
hook: the sound-alike or symbol for the hardest word(s), as "word → image" (e.g. "allele → bowling alley"). Invent fresh images; don't reuse the examples.
imagePrompt: the same scene described visually in one paragraph (subject, action, the object, lighting). No text in the image."""


def split_notes(notes: str) -> list[dict]:
    """How many stops do these notes need? One per idea, where an idea is what fits in one
    picture. Returns [{text, kind, keyTerms}]."""
    def produce():
        if MOCK:
            return _mock_split(notes)
        result = _generate_json(
            f'''You coach memory athletes. A student will store these notes in a memory palace, one idea per stop.

Notes:
"""
{notes}
"""

Cut the notes into ideas. Each idea is ONE short, self-contained sentence a teacher could quiz on,
small enough to picture as a single scene: a term and its meaning, a cause and its effect, a name and
what they did, a number and what it counts.
- Split long lists (more than 4 items) and multi-part definitions into separate ideas, in order.
- A numbered or bulleted line in the notes ("4th Amendment: ...", "3. ...") stays ONE idea, keeping
  its number, unless it lists more than 4 things: the student's numbering should match the stops.
- Keep exact numbers, dates, names, units and formulas. Never invent facts that aren't in the notes.
- Skip headings, filler and repeats. Keep the order of the notes.
- Use as many ideas as the notes really need (a few lines: a few ideas; a chapter: many), at most {MAX_IDEAS}.
  If there is more than that, keep the {MAX_IDEAS} most important.
For each idea also give:
- kind: {", ".join(IDEA_KINDS)}. Use "name" whenever the thing to remember is mainly a person's or
  place's name (even in an ordered list: "the 3rd president was Thomas Jefferson" is a name).
- keyTerms: the 1-4 words or numbers a correct answer must contain (e.g. ["mitochondria", "ATP"]).''',
            _obj(ideas={"type": "array", "items": _obj(
                text=STRING, kind={"type": "string", "enum": IDEA_KINDS},
                keyTerms={"type": "array", "items": STRING})}),
        )
        return result["ideas"][:MAX_IDEAS]
    return cached_json(["split-v5", models["text"], notes], produce)


SCENE_BATCH = 5  # scenes are written in parallel batches: much faster than one long answer
_pool = ThreadPoolExecutor(max_workers=8)


def write_scenes(ideas: list[dict], locations: list[str], flavor: str = "silly") -> list[dict]:
    """One scene per idea, idea i at location i. Each batch is cached on its own, so adding stops
    at the end of the path and filling again only writes the new ones."""
    starts = range(0, len(ideas), SCENE_BATCH)
    jobs = [_pool.submit(_write_scene_batch, ideas[s:s + SCENE_BATCH], locations[s:s + SCENE_BATCH], flavor)
            for s in starts]
    items = []
    for start, job in zip(starts, jobs):
        items += [{**item, "location": item["location"] + start} for item in job.result()]
    return items


def _write_scene_batch(ideas, locations, flavor):
    def produce():
        if MOCK:
            return _mock_scenes(ideas, locations)
        lines = []
        for i, idea in enumerate(ideas):
            pegs = number_pegs(idea["text"])
            extra = f"; number images to use, in order: {pegs}" if pegs else ""
            if idea["kind"] == "name":
                # Names need their own picture too, or the number image takes over the scene.
                extra += "; ALSO turn the name into a concrete sound-alike object (Washington -> a washing machine)"
            lines.append(f'{i + 1}. At "{locations[i]}" ({idea["kind"]}; key terms: {", ".join(idea["keyTerms"])}{extra}): {idea["text"]}')
        kinds = list(dict.fromkeys(idea["kind"] for idea in ideas))
        techniques = "\n".join(f"- {k}: {TECHNIQUES.get(k, TECHNIQUES['fact'])}" for k in kinds)
        result = _generate_json(
            f"""You help a student build a memory palace (method of loci) in a real place they know.
Here is part of their walking path, with the idea stored at each stop:
{chr(10).join(lines)}

Techniques by kind of idea:
{techniques}

For each stop write a scene, a hook and an imagePrompt.

{scene_rules(flavor)}""",
            _obj(items={"type": "array", "items": _obj(
                location={"type": "integer"}, scene=STRING, hook=STRING, imagePrompt=STRING)}),
        )
        return result["items"]
    return cached_json(["scenes-v10", models["text"], ideas, locations, flavor], produce)


# ---- 2a. Notes from a photo, PDF or voice recording ----

def extract_notes(data: bytes, mime_type: str, file_hash: str) -> dict:
    def produce():
        if MOCK:
            return {"text": "Mock mode: imagine the notes from your file here.\nAdd a GEMINI_API_KEY to read real files."}
        audio = mime_type.startswith("audio/") or mime_type == "video/webm"
        prompt = (
            """A student is talking about what they need to remember. Turn the recording into clean study notes:
one fact per line, in the order spoken. Drop filler ("um", "so basically"), repeats and off-topic talk,
keep every name, number, date and definition exactly. If the recording has no study content, return an empty text."""
            if audio else
            """This is a student's study material (a photo of notes, slides, a textbook page or a PDF).
Transcribe it as clean study notes: one fact per line, in reading order. Keep every name, number, date,
formula and definition exactly; fix obvious OCR mistakes; skip page numbers, headers and decoration.
Describe diagrams in one line each. If there is no study content, return an empty text."""
        )
        return _generate_json(prompt, _obj(text=STRING), data, mime_type)
    return cached_json(["extract", models["text"], file_hash], produce)


# ---- 2b. Find good stops in a room photo (to build the palace automatically) ----

def find_stops(photo: bytes, mime_type: str, photo_key: str, room_type: str = "panorama") -> list[dict]:
    """[{label, x, y}] with x, y from 0 to 1000 in the photo. Cached per photo, so each room
    is only ever looked at once."""
    def produce():
        if MOCK:
            return [{"label": f"spot {chr(65 + i)}", "x": 50 + i * 100, "y": 500} for i in range(10)]
        what = ("a wide panorama photo of a real place, going all the way around the viewer"
                if room_type == "panorama" else "a photo of a real place")
        result = _generate_json(
            f"""This is {what}.
Pick up to {24 if room_type == "panorama" else 8} distinct, easy-to-recognize objects or spots where someone could imagine a memorable scene
happening: furniture, signs, doors, windows, art, plants, equipment, parts of a building. Spread them across the whole width
of the photo. Skip people and anything tiny or blurry.
For each: a short name (1-4 lowercase words, like "chess set" or "red armchair") and the point at its
center, as x (left to right) and y (top to bottom), each from 0 to 1000.""",
            _obj(stops={"type": "array", "items": _obj(label=STRING, x={"type": "integer"}, y={"type": "integer"})}),
            photo,
            mime_type,
        )
        return result["stops"]
    return cached_json(["stops", models["text"], photo_key], produce)


# ---- 2c. A short description (Natasha's campus mode: "describe this subject / term") ----

def describe(kind: str, text: str, subject: str = "", place: str = "") -> str:
    def produce():
        if MOCK:
            return f"Mock mode: a short description of {text}."
        if kind == "subject":
            prompt = f"In 2-3 plain sentences, describe what a student studies in {text!r}" + (f", as if pinned at {place}" if place else "") + "."
        else:
            prompt = f"In 2-3 plain sentences, define {text!r}" + (f" in the context of {subject}" if subject else "") + " for a student."
        return _generate_json(prompt, _obj(description=STRING))["description"]
    return cached_json(["describe", models["text"], kind, text, subject, place], produce)


# ---- 3. A missed spot gets a weirder scene ----

def weirder_scene(fact: str, label: str, scene: str, level: int, kind: str = "fact", flavor: str = "silly") -> dict:
    def produce():
        if MOCK:
            return {
                "scene": f'At the {label}, {level + 1} singing octopuses in tuxedos tattoo "{fact}" onto a dancing elephant.',
                "hook": "octopus tattoo → the fact",
                "imagePrompt": f"Singing octopuses in tuxedos and a dancing elephant at a {label} (weirdness {level})",
            }
        return _generate_json(
            f"""A student forgot this fact during a memory-palace quiz:
Fact: {fact}
Location in their room: {label}
The scene that didn't stick: {scene}

Write a NEW scene at the same location that is far weirder and more vivid (weirdness level {level} of 5):
more absurd, bigger, louder, more emotional, more personal. Use a DIFFERENT hook than before and make the
key words impossible to miss. Technique for this kind of idea ({kind}): {TECHNIQUES.get(kind, TECHNIQUES['fact'])}

{scene_rules(flavor)}""",
            _obj(scene=STRING, hook=STRING, imagePrompt=STRING),
        )
    return cached_json(["weirder-v6", models["text"], fact, kind, label, scene, level, flavor], produce)


def weirder_scenes(stops: list[dict], flavor: str = "silly") -> list[dict]:
    """Weirder scenes for several missed stops in one call (end of a quiz). Each stop:
    {fact, label, scene, level, kind}. Results already cached are reused."""
    keys = [["weirder-v6", models["text"], s["fact"], s["kind"], s["label"], s["scene"], s["level"], flavor] for s in stops]
    results = [None] * len(stops)
    todo = []
    for i, key in enumerate(keys):
        cached = lookup_json(key)
        if cached:
            results[i] = cached
        else:
            todo.append(i)
    if todo and MOCK:
        for i in todo:
            results[i] = weirder_scene(stops[i]["fact"], stops[i]["label"], stops[i]["scene"], stops[i]["level"])
        todo = []
    if todo:
        lines = "\n".join(
            f'{n + 1}. Fact: {stops[i]["fact"]} | Location: {stops[i]["label"]} | Weirdness level {stops[i]["level"]} of 5 '
            f'| Kind: {stops[i]["kind"]} | The scene that did not stick: {stops[i]["scene"]}' for n, i in enumerate(todo))
        kinds = list(dict.fromkeys(stops[i]["kind"] for i in todo))
        techniques = "\n".join(f"- {k}: {TECHNIQUES.get(k, TECHNIQUES['fact'])}" for k in kinds)
        result = _generate_json(
            f"""A student forgot these facts during a memory-palace quiz:
{lines}

For each, write a NEW scene at the same location that is far weirder and more vivid (at its weirdness level):
more absurd, bigger, louder, more emotional, more personal. Use a DIFFERENT hook than before and make the
key words impossible to miss.
Techniques by kind of idea:
{techniques}

{scene_rules(flavor)}""",
            _obj(items={"type": "array", "items": _obj(number={"type": "integer"}, scene=STRING, hook=STRING, imagePrompt=STRING)}),
        )
        by_number = {item["number"]: item for item in result["items"]}
        for n, i in enumerate(todo):
            item = by_number.get(n + 1)
            if item:
                results[i] = {"scene": item["scene"], "hook": item["hook"], "imagePrompt": item["imagePrompt"]}
                store_json(keys[i], results[i])
    return results


# ---- 4. A picture per stop (cached) ----

PICTURE_STYLES = {
    "storybook": "a warm storybook illustration, soft watercolor and ink",
    "claymation": "a claymation scene, handmade plasticine figures, stop-motion look",
    "sticker": "a cute die-cut sticker illustration, bold outlines, flat bright colors",
    "pixel": "detailed 16-bit pixel art",
}

DOODLE_LOOK = {
    "storybook": "soft pastel fills",
    "claymation": "rounded blobby shapes with soft shading, like clay",
    "sticker": "bright flat colors with a thick white outline around each figure, like stickers",
    "pixel": 'chunky square pixels only (rects on a grid), shape-rendering="crispEdges"',
}


def _placeholder(prompt: str, style: str) -> str:
    return cached_image(["placeholder-v2", style, prompt], lambda: placeholder_image(prompt, style))


def generate_image(prompt: str, crop: bytes | None, style: str = "storybook"):
    """(file name, final). final=False means Gemini was busy and this is a stand-in sketch: show it,
    but don't save it on the stop, so the real picture is tried again next time."""
    if PICTURES == "placeholder":
        return _placeholder(prompt, style), True
    if PICTURES == "doodle":
        [name] = generate_doodles([prompt], style)
        return (name, True) if name else (_placeholder(prompt, style), False)
    return _generate_real_image(prompt, crop, style), True


def _generate_real_image(prompt, crop, style):
    """With a crop of the real room, Gemini edits that photo, so the scene appears in the user's
    actual room, not a generic one."""
    import base64
    look = PICTURE_STYLES.get(style, PICTURE_STYLES["storybook"])

    def produce():
        text = (f"This photo shows a spot in my room. Redraw it as {look}, with this scene happening right\n"
                f"there and the room still recognizable. Vivid and funny, no text. Scene: {prompt}"
                if crop else f"{look}, vivid and funny, no text. Scene: {prompt}")
        res = _with_retry(lambda model: _client.models.generate_content(
            model=model, contents=[_image_part(crop), text] if crop else text), models["image"])
        parts = res.candidates[0].content.parts if res.candidates else []
        image = next((p.inline_data for p in parts if p.inline_data), None)
        if not image:
            raise GeminiError("Gemini returned no image (it may have been blocked). Try again.")
        return image.data, (image.mime_type.split("/")[1] or "png")
    key = ["image", models["image"], style, prompt, base64.b64encode(crop).decode() if crop else None]
    return cached_image(key, produce)


DOODLE_BATCH = 4  # doodles per Gemini call


def _doodle_key(prompt, style):
    return ["doodle-v1", models["text"], style, prompt]


def generate_doodles(prompts: list[str], style: str) -> list[str | None]:
    """Little SVG drawings of these scenes: cached ones from disk, the rest drawn DOODLE_BATCH per
    Gemini call (one request instead of one per picture). None where a drawing failed."""
    names = [lookup_image(_doodle_key(p, style)) for p in prompts]
    missing = [i for i, name in enumerate(names) if not name]
    for start in range(0, len(missing), DOODLE_BATCH):
        batch = missing[start:start + DOODLE_BATCH]
        try:
            drawings = _draw_doodles([prompts[i] for i in batch], style)
        except Exception as err:
            log.info("Doodles failed, showing sketches for now: %s", err)
            continue
        for j, i in enumerate(batch):
            svg = clean_svg(drawings.get(j + 1, ""))
            if svg:
                names[i] = store_image(_doodle_key(prompts[i], style), svg.encode(), "svg")
    return names


def _draw_doodles(prompts, style) -> dict:
    scenes = "\n".join(f"{i + 1}. {p}" for i, p in enumerate(prompts))
    result = _generate_json(
        f"""Draw each of these scenes as a playful cartoon doodle in SVG.
{scenes}

Rules for every drawing: one <svg> element with xmlns="http://www.w3.org/2000/svg" and viewBox="0 0 768 468".
A simple background (floor + wall or sky), then 2-4 big, recognizable characters or objects doing the action.
Thick dark outlines (#3B2A1E, stroke-width 5), {DOODLE_LOOK.get(style, DOODLE_LOOK['storybook'])}, expressive faces.
Only basic shapes and paths. No text, no <script>, no <image>, no external links, no animation. Under 6 KB each.
Return one drawing per scene, numbered like the scenes.""",
        _obj(drawings={"type": "array", "items": _obj(scene={"type": "integer"}, svg=STRING)}),
    )
    return {d["scene"]: d["svg"] for d in result["drawings"]}


def clean_svg(text: str):
    """Keep only a plain drawing: no scripts, event handlers, links or embedded content.
    (SVGs are shown in <img> tags, where scripts can't run anyway, but someone could open one directly.)"""
    match = re.search(r"<svg[\s\S]*</svg>", text, re.I)
    if not match or len(match.group(0)) > 60_000:
        return None
    svg = match.group(0)
    svg = re.sub(r"<(script|foreignObject|iframe|image|use|a|style)\b[\s\S]*?</\1\s*>", "", svg, flags=re.I)
    svg = re.sub(r"<(script|foreignObject|iframe|image|use|a|style)\b[^>]*/?>", "", svg, flags=re.I)
    svg = re.sub(r"\son\w+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", "", svg, flags=re.I)
    return re.sub(r"(href|xlink:href)\s*=\s*(\"[^\"]*\"|'[^']*')", "", svg, flags=re.I)


# ---- Mock mode (no API key) ----

def _mock_split(notes):
    sentences = [s.strip().lstrip("-*•0123456789.) ").strip() for s in re.split(r"(?<=[.!?])\s+|\n+", notes)]
    ideas = [s for s in sentences if len(s) > 8 and not s.endswith(":")][:MAX_IDEAS]
    return [{"text": s, "kind": "fact", "keyTerms": [w for w in re.split(r"\W+", s) if len(w) > 5][:2]} for s in ideas]


def _mock_scenes(ideas, locations):
    return [{
        "location": i + 1,
        "scene": f'At the {locations[i]}, a giant talking hamster shouts "{idea["text"]}" while juggling flaming pineapples.',
        "hook": "hamster → shouting the fact",
        "imagePrompt": f"A giant hamster juggling flaming pineapples next to a {locations[i]}",
    } for i, idea in enumerate(ideas)]
