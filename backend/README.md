# Neverforgator: how the app works

The method of loci works, but building a palace in your head is hard. Neverforgator builds it in real places
you know: the built-in Reitz Union route, other campus routes, or your own room. Each stop holds one idea as
a little **friend**, and Gemini turns your notes into bizarre scenes that happen at those exact stops.

## Run it

```bash
npm run setup                          # installs root, backend/ and frontend/
cp backend/.env.example backend/.env   # add GEMINI_API_KEY (never commit .env)
# frontend/.env.local: the two VITE_AUTH0_* lines from the main README
npm run dev                            # backend on :3001, app on http://localhost:5173
cd backend && npm run seed-samples <reitzPalaceId>   # once: the built-in Reitz route + mitosis example
```

- No `GEMINI_API_KEY`: **Mock AI** mode (placeholder facts and scenes), shown as a "mock AI" chip.
- No `frontend/.env.local` / `AUTH0_DOMAIN`: no login; everything belongs to one local user.
- Pictures (`PICTURES` in `.env`): `doodle` (default) has Gemini's text model draw a small SVG of each
  scene (one cheap call, free tier OK, falls back to a sketch card if Gemini is busy); `gemini` draws real
  images (needs billing, about $0.03-0.07 each); `placeholder` makes free sketch cards with no API call.

Auth0 only allows **http://localhost:5173**, so demo with `npm run dev`. To use the built version
(`npm run build && npm start`, port 3001), add `http://localhost:3001` to the Auth0 app's allowed URLs.

## The steps

The look comes from Kira's mockups in `design/`: warm paper, chunky ink outlines, and every stop is a
friend. It starts as an egg, hatches when it gets a fact, bounces when you remember it in the quiz,
and falls asleep when you don't.

| Step | What happens | Where in the code |
|---|---|---|
| Sign in | Auth0 login; palaces belong to the user. The landing page links to the tour | `frontend/src/App.jsx`, `backend/auth.js` |
| Tour | First visit: a 1-minute visual walkthrough that teaches the phases of mitosis on 5 Reitz stops, quizzes you on them, then starts you in the Reitz | `Guide.jsx` (`#/guide`) |
| Pick a place | **Built in: the Reitz Union** ("Start memorizing here" copies it and opens the notes box), a finished example to explore, other campus routes, or your own room | `PalaceList.jsx`, `lib/start.js`, `POST /palaces/:id/copy` |
| Build | Upload panoramas or 3D scans; click to plant eggs (stops). Gemini names each stop. Click an egg to open its card: rename, move, reorder, delete | `RoomStrip.jsx`, `Viewer.jsx`, `SpotCard.jsx`, `lib/placing.js` |
| Notes in | Paste, **snap a photo or PDF** of your notes (Gemini reads it), **upload a recording**, or **talk** (live speech-to-text in the browser) | `NotesImport.jsx`, `POST /api/import` |
| Fill from notes | Builds the whole palace. Gemini cuts the notes into ideas (one picture each, as many as the notes need), gives each its own stop (your eggs first, then objects it finds in your panoramas, room by room), and writes a scene + sound-alike "hook" per stop, using the classic technique for each kind of idea (number pegs for numbers and dates, sound-alikes for names and vocabulary, a chain reaction for processes...). If the rooms run out of stops it says how many more you need instead of cramming | `FeedModal.jsx`, `POST /fill`, `panorama.js`, `gemini.js` |
| Wander | The camera walks to each friend, across rooms ("walking into Room 2"); its picture appears right at its stop, and a polaroid shows picture, scene, hook and fact. Pictures are drawn here, a few stops ahead, so you only pay for the ones you visit | `WanderCard.jsx`, `CameraRig` in `Viewer.jsx` |
| Quiz | Alternates **"What lives at your desk?"** (typed) and **"Where did you put X?"** (tap the friend in 3D or pick a place). Checked instantly in the browser; unclear answers show the fact and you say if you had it. Misses get a weirder scene | `QuizCard.jsx`, `lib/grade.js`, `/result`, `/weirder` |
| Review | Each quiz schedules the next walk: 1, 3, 7, 21, 60 days while you score 80%+, otherwise again in 10 minutes. "review due" shows on the home screen | `POST /reviews`, `PalaceList.jsx` |

## Fair-use limits (`backend/limits.js`)

| Limit | Value |
|---|---|
| Notes per fill | 20,000 characters (≈ 5,000 tokens), counter in the notes box |
| Palace fills | 20 a day per user |
| Photo / PDF / audio scans | 10 a day (talking live is free: it runs in the browser) |
| Rewritten scenes (missed quiz answers, edited ideas) | 60 a day |
| Pictures | 150 a day |
| Any API call | 120 a minute |

Counts live in `data/usage.json` (reset daily, UTC); requests that fail on our side don't count. Every
Gemini call has a 40 s deadline and two retries. With several servers, move the counts to Redis/Postgres.

## The method we follow

How memory athletes build a palace, and where the app does it:

1. **Pick a route you know** and fix its order. Every stop is a distinct object (no two "foosball tables"),
   far enough apart to tell apart, walked in one direction. → Fill skips duplicates and stops too close together; the path goes room by room, left to right.
2. **Chunk first:** one idea per stop, about what fits in one picture. Overloaded stops blur. → `splitNotes` decides how many stops the notes need.
3. **Make it vivid and tie it to the object:** absurd, moving, loud, touching the stop; abstract words become sound-alikes ("allele → bowling alley"). → `SCENE_RULES` and the hook.
4. **Mark every 5th stop** so you can jump in the middle and keep count. → gold tags.
5. **Recall right away, in order, then spaced out**, and fix the images that didn't stick. → Quiz in path order, review schedule, weirder scenes for misses.

## Campus templates

A template is a normal palace the team builds once (rooms + stops along the route), then shares:

```bash
cd backend
npm run make-template <palaceId>      # the id is in the URL: #/palace/<id>
npm run make-template <palaceId> off  # undo
```

Everyone sees it under "More campus routes" and clicking **Start here** gives them their own copy
(same stops, no facts). Room files are hard-linked, so a 95 MB scan isn't duplicated per user.

The **built-in Reitz** and the **mitosis example** are made by `npm run seed-samples <reitzPalaceId>` from a
palace of the Reitz you built in the app. They belong to `system`, so nobody can change or delete them;
run it again to rebuild them.

## How it fits together

```
frontend/ (React + Vite + three.js)  ──Auth0 token──▶  backend/ (Express)  ──▶  Gemini
                                                          └──▶ backend/data/ (files)
```

- **Auth** (`auth.js`): checks the Auth0 access token on every `/api/palaces` call and sets `req.userId`
  (the Auth0 `sub`). With `AUTH0_AUDIENCE` set it verifies JWTs locally; otherwise it asks Auth0's
  `/userinfo` (cached, because Auth0 rate-limits it). Images under `/files` and `/cache` stay public
  (an `<img>` can't send a token); their names are random.
- **Storage** (`storage.js`): each palace is a folder `data/palaces/<id>/` with `palace.json`, room files and
  stop crops. All reads/writes go through this file, so it can be swapped for Postgres without touching
  the routes. Saves per palace are queued so parallel jobs can't overwrite each other.
- **Never pay twice** (`cache.js`): every Gemini result is saved in `data/cache/` under a hash of its inputs.
- **The Gemini key** is only read in `gemini.js`. On startup the server picks the newest available
  `gemini-X-flash` text model (override with `GEMINI_TEXT_MODEL` / `GEMINI_IMAGE_MODEL`).
- **Stops** are a *direction* from the camera on panoramas, or a *3D point* plus camera position on 3D
  scans. Their order in `palace.spots` is the walking path.

## Demo checklist

1. Build the campus template and your demo palace **before** demo day so every Gemini result is cached.
   `backend/data/` and `maps/` are gitignored: copy them to the demo laptop yourself.
2. Panoramas: Chrome can't read HEIC, so convert first:
   `sips -s format jpeg --resampleWidth 8192 IMG_1234.HEIC --out IMG_1234.jpg`.
3. 3D scans (Polycam/Scaniverse .ply/.spz) start flipped, since most exports are upside down. If one
   looks wrong, click "Flip scan" **before** placing stops. Walk with WASD, Q/E for down/up.
4. Every picture has a Retry button; failed requests show the reason as a toast.

## To-do

- [ ] **Build the UF campus route template.** Capture more stops (Century Tower, Marston, ...), place the
      stops in order, then `npm run make-template <id>`.
- [x] **Onboarding tour** (`Guide.jsx`) and the built-in Reitz route.
- [ ] **Real pictures.** Turn on billing for the Gemini key and set `PICTURES=gemini` (about $0.03-0.07 per
      picture, drawn once per stop and cached). Do it for the demo palace first.
- [ ] **Auto-placed stops in 3D scans.** Fill only finds new stops in panoramas; for scans, render a few
      views and ask Gemini the same way.
- [ ] **Topic-only input.** If the notes are just a topic, have Gemini write the notes first.
- [ ] **Postgres** (Thomas): swap `storage.js` for the database; routes don't need to change.
- [ ] **Auth0 API audience** (optional): create an API in the tenant so the backend verifies JWTs locally
      instead of calling `/userinfo`.
- [ ] **Team README:** update the plan for the 3D campus route, own-room palaces and the two-way quiz.
