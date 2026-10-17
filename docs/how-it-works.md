# NeverForgator: how the app works

The method of loci works, but building a palace in your head is hard. NeverForgator builds it in real places
you know: the built-in Reitz Union route, other campus routes, or your own room. Each stop holds one idea as
a little **friend**, and Gemini turns your notes into bizarre scenes that happen at those exact stops.

## Run it

The studio runs on the team's FastAPI backend (Python) and the React frontend. Setup is in the
[root README](../README.md); the short version, from the repo root:

```bash
npm run setup                          # frontend packages + backend/.venv, tables, campus locations
cp backend/.env.example backend/.env   # add GEMINI_API_KEY (never commit .env)
# frontend/.env.local: the VITE_AUTH0_* lines from the root README (with VITE_AUTH0_AUDIENCE)
npm run dev                            # FastAPI on :8000, app on http://localhost:5173
npm test                               # backend tests (mock AI, throwaway database)
cd backend && .venv/bin/python -m app.studio.seed_samples --reitz <folder>   # once: shared palaces
```

- No `GEMINI_API_KEY`: **Mock AI** mode (placeholder facts and scenes), shown as a "mock AI" chip.
- `DEV_AUTH=true` in `backend/.env` skips Auth0 (local testing only); run the frontend without
  `VITE_AUTH0_DOMAIN` then. `API_URL=http://localhost:8001 npm --prefix frontend run dev` points Vite at
  another backend.
- Pictures (`PICTURES` in `.env`): `doodle` (default) has Gemini's text model draw a small SVG of each
  scene (one cheap call, free tier OK, falls back to a sketch card if Gemini is busy); `gemini` draws real
  images (needs billing, about $0.03-0.07 each); `placeholder` makes free sketch cards with no API call.
- **Two modes for now:** the 3D studio (default) and **campus mode** (Natasha's UF campus walk, the
  "Campus mode" button on the home screen, `src/palace/`). They share the login; we'll merge them later.

Auth0 only allows **http://localhost:5173**, so demo with `npm run dev`.

## The steps

The look comes from Kira's mockups in `design/`: warm paper, chunky ink outlines, and every stop is a
friend. It starts as an egg, hatches when it gets a fact, bounces when you remember it in the quiz,
and falls asleep when you don't.

| Step | What happens | Where in the code |
|---|---|---|
| Sign in | Auth0 login; palaces belong to the user. The landing page links to the tour | `frontend/src/App.jsx`, `backend/app/auth.py` |
| Tour | First visit: a 1-minute visual walkthrough that teaches the phases of mitosis on 5 Reitz stops, quizzes you on them, then starts you in the Reitz | `Guide.jsx` (`#/guide`) |
| Pick a place | **Built in: the Reitz Union** ("Start memorizing here" copies it and opens the notes box), a finished example to explore, the **UF campus walk** (campus mode's building photos as photo rooms), or your own room | `PalaceList.jsx`, `lib/start.js`, `POST /api/palaces/{id}/copy` |
| Build | Upload panoramas, regular photos (shown as a window in front of you) or 3D scans; click to plant eggs (stops). Gemini names each stop. Click an egg to open its card: rename, move, reorder, delete | `RoomStrip.jsx`, `Viewer.jsx`, `SpotCard.jsx`, `lib/placing.js` |
| Notes in | Paste, **snap a photo or PDF** of your notes (Gemini reads it), **upload a recording**, or **talk** (live speech-to-text in the browser) | `NotesImport.jsx`, `POST /api/import` |
| Fill from notes | Builds the whole palace. Gemini cuts the notes into ideas (one picture each, as many as the notes need), gives each its own stop (your eggs first, then objects it finds in your panoramas, room by room), and writes a scene + sound-alike "hook" per stop, using the classic technique for each kind of idea (number pegs for numbers and dates, sound-alikes for names and vocabulary, a chain reaction for processes...). If the rooms run out of stops it says how many more you need instead of cramming | `FeedModal.jsx`, `POST /api/palaces/{id}/fill`, `app/studio/fill.py`, `app/studio/gemini.py` |
| Wander | The camera walks to each friend, across rooms ("walking into Room 2"); its picture appears right at its stop, and a polaroid shows picture, scene, hook and fact. Pictures are drawn here, a few stops ahead, so you only pay for the ones you visit | `WanderCard.jsx`, `CameraRig` in `Viewer.jsx` |
| Quiz | Alternates **"What lives at your desk?"** (typed) and **"Where did you put X?"** (tap the friend in 3D or pick a place). Checked instantly in the browser; unclear answers show the fact and you say if you had it. Misses get a weirder scene | `QuizCard.jsx`, `lib/grade.js`, `.../result`, `.../weirder` |
| Preferences | The avatar menu: default picture style, how weird scenes get (wild / silly / classroom-safe, sent to the prompt), quiz style (both ways / typing / finding). Kept in the browser | `AccountMenu.jsx`, `lib/prefs.js` |
| Review | Each quiz schedules the next walk: 1, 3, 7, 21, 60 days while you score 80%+, otherwise again in 10 minutes. "review due" shows on the home screen | `POST /api/palaces/{id}/reviews` (saved as quiz attempts), `PalaceList.jsx` |

## Fair-use limits (`backend/app/studio/limits.py`)

| Limit | Value |
|---|---|
| Notes per fill | 20,000 characters (≈ 5,000 tokens), counter in the notes box |
| Palace fills | 20 a day per user |
| Photo / PDF / audio scans | 10 a day (talking live is free: it runs in the browser) |
| Rewritten scenes (missed quiz answers, edited ideas) | 60 a day |
| Pictures | 150 a day |
| Any API call | 120 a minute |

Counts live in the `usage_counts` table (per user and day, UTC); requests that fail with 400 or on our side
don't count. Every Gemini call has a 40 s deadline and two retries. The per-minute limit is kept in memory.

## The method we follow

How memory athletes build a palace, and where the app does it:

1. **Pick a route you know** and fix its order. Every stop is a distinct object (no two "foosball tables"),
   far enough apart to tell apart, walked in one direction. → Fill skips duplicates and stops too close together; the path goes room by room, left to right.
2. **Chunk first:** one idea per stop, about what fits in one picture. Overloaded stops blur. → `split_notes` decides how many stops the notes need.
3. **Make it vivid and tie it to the object:** absurd, moving, loud, touching the stop; abstract words become sound-alikes ("allele → bowling alley"). → `scene_rules()`, `TECHNIQUES` and the hook (number pegs are worked out in code).
4. **Mark every 5th stop** so you can jump in the middle and keep count. → gold tags.
5. **Recall right away, in order, then spaced out**, and fix the images that didn't stick. → Quiz in path order, review schedule, weirder scenes for misses.

## Shared palaces (templates)

A shared palace (`palaces.template`) can be opened and copied by everyone, but only changed by its owner.
"Start here" gives you your own copy (same stops, no facts); room files are hard-linked, so a 95 MB scan
isn't duplicated per user.

```bash
cd backend
.venv/bin/python -m app.studio.seed_samples --reitz <folder>   # Reitz Union, mitosis example, UF campus walk
.venv/bin/python -m app.studio.make_template <palaceId> [off]  # share (or unshare) any palace
```

`--reitz` is a Reitz palace folder exported by the old Node server (`palace.json` + room files; ours is in
`backend/data/legacy-node/b7c9970f`). The built-ins belong to the `system` user; run it again to rebuild them.

## How it fits together

```
frontend/ (React + Vite + three.js) ──Auth0 token──▶ backend/ (FastAPI) ──▶ Gemini
   ├─ src/        3D studio                            ├─ app/routers/   Thomas's campus API (/palaces, /locations, /me)
   └─ src/palace/ campus mode (Natasha)                ├─ app/studio/    studio API (/api/...), Gemini, fill, limits
                                                       ├─ SQLite / Neon Postgres (app/models.py, alembic/)
                                                       └─ data/          room files, crops, pictures, AI cache
```

- **Auth** (`app/auth.py`, Thomas's): checks the Auth0 access token (audience `https://loci-api`) and
  finds or creates the user. Files under `/files` and `/cache` stay public (an `<img>` can't send a token);
  their names are random, and they're served with a no-scripts CSP.
- **Database** (`app/models.py`): studio palaces use the same `palaces` and `palace_stops` tables as the
  campus API. A stop sits at a campus `location_id` *or* in a `room` (with a direction or 3D point);
  the idea is `concept`, the scene is `association`. New: `rooms`, `usage_counts` (migration `0002`).
- **Never pay twice** (`app/studio/cache.py`): every Gemini result is saved in `data/cache/` under a hash of
  its inputs.
- **The Gemini key** is only read in `app/studio/gemini.py`. On startup the server picks the newest
  `gemini-X-flash` text model (override with `GEMINI_TEXT_MODEL` / `GEMINI_IMAGE_MODEL`).
- **Stops** are a *direction* from the camera in panoramas and photos, or a *3D point* plus camera
  position in scans. `stop_order` is the walking path.

## Demo checklist

1. Seed the shared palaces and fill your demo palace **before** demo day so every Gemini result is cached.
   `backend/data/`, `backend/loci.db` and `maps/` are gitignored: copy them to the demo laptop yourself.
2. Panoramas: Chrome can't read HEIC, so convert first:
   `sips -s format jpeg --resampleWidth 8192 IMG_1234.HEIC --out IMG_1234.jpg`.
3. 3D scans (Polycam/Scaniverse .ply/.spz) start flipped, since most exports are upside down. If one
   looks wrong, click "Flip scan" **before** placing stops. Walk with WASD, Q/E for down/up.
4. Every picture has a Retry button; failed requests show the reason as a toast.

## To-do

- [x] **Onboarding tour** (`Guide.jsx`) and the built-in Reitz route.
- [x] **Backend in FastAPI** with the team's database; UF campus walk as a second built-in route.
- [ ] **Merge the two modes** into one app (campus mode's dashboard, night mode and accessibility settings
      into the studio, or the studio's AI into campus mode).
- [ ] **Real pictures.** Turn on billing for the Gemini key and set `PICTURES=gemini` (about $0.03-0.07 per
      picture, drawn once per stop and cached). Do it for the demo palace first.
- [ ] **Auto-placed stops in 3D scans.** Fill only finds new stops in panoramas and photos; for scans,
      render a few views and ask Gemini the same way.
- [ ] **Topic-only input.** If the notes are just a topic, have Gemini write the notes first.
- [ ] **Deploy:** room files and pictures need a persistent disk (or object storage) next to Neon.
