# Mind Palace: how the app works

The method of loci works, but building a palace in your head is hard. Mind Palace builds it in real places
you know: a UF campus route (shared template) or your own room. Each stop holds one fact as a little
**friend**, and Gemini turns your notes into bizarre scenes that happen at those exact stops.

## Run it

```bash
npm run setup                          # installs root, backend/ and frontend/
cp backend/.env.example backend/.env   # add GEMINI_API_KEY (never commit .env)
# frontend/.env.local: the two VITE_AUTH0_* lines from the main README
npm run dev                            # backend on :3001, app on http://localhost:5173
```

- No `GEMINI_API_KEY`: **Mock AI** mode (placeholder facts and scenes), shown as a "mock AI" chip.
- No `frontend/.env.local` / `AUTH0_DOMAIN`: no login; everything belongs to one local user.
- `PICTURES=placeholder` (default): Gemini writes everything, but pictures are free SVG sketches.
  `PICTURES=gemini` draws real images (needs billing on the Google Cloud project).

Auth0 only allows **http://localhost:5173**, so demo with `npm run dev`. To use the built version
(`npm run build && npm start`, port 3001), add `http://localhost:3001` to the Auth0 app's allowed URLs.

## The steps

The look comes from Kira's mockups in `design/`: warm paper, chunky ink outlines, and every stop is a
friend. It starts as an egg, hatches when it gets a fact, bounces when you remember it in the quiz,
and falls asleep when you don't.

| Step | What happens | Where in the code |
|---|---|---|
| Sign in | Auth0 login; palaces belong to the user | `frontend/src/App.jsx`, `backend/auth.js` |
| Pick a place | Start from a **campus template** (stops already placed) or build in your own room | `PalaceList.jsx`, `POST /palaces/:id/copy` |
| Build | Upload panoramas or 3D scans; click to plant eggs (stops). Gemini names each stop | `RoomStrip.jsx`, `Viewer.jsx`, `SplatRoom.jsx`, `lib/placing.js` |
| Fill from notes | Gemini picks one fact per stop and writes a scene; a picture per stop (sketch for now) | `FeedModal.jsx`, `lib/useImageQueue.js`, `gemini.js` |
| Wander | The camera walks to each friend; a polaroid shows picture, scene and fact | `WanderCard.jsx`, `CameraRig` in `Viewer.jsx` |
| Quiz | Alternates **"What lives at your desk?"** (typed, Gemini grades) and **"Where did you put X?"** (tap the friend in 3D or pick a place). Misses get a weirder scene | `QuizCard.jsx`, `/grade`, `/weirder` |

## Campus templates

A template is a normal palace the team builds once (rooms + stops along the route), then shares:

```bash
cd backend
npm run make-template <palaceId>      # the id is in the URL: #/palace/<id>
npm run make-template <palaceId> off  # undo
```

Everyone sees it under "Walk a campus route" and clicking **Start here** gives them their own copy
(same stops, no facts). Room files are hard-linked, so a 95 MB scan isn't duplicated per user.

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

- [ ] **Onboarding for new users.** A short guided tour for people who've never heard of a memory palace:
      what the method of loci is and why it works, then a hands-on demo on the built-in Reitz map
      (a pre-filled palace: wander 3 stops, then a mini quiz). The landing page (`#/about`) is the first step.
- [ ] **Build the UF campus route template.** Capture more stops (Century Tower, Marston, ...), place the
      stops in order, then `npm run make-template <id>`.
- [ ] **Real pictures.** Turn on billing for the Gemini key and set `PICTURES=gemini`.
- [ ] **Topic-only input.** If the notes are just a topic, have Gemini write the notes first.
- [ ] **Postgres** (Thomas): swap `storage.js` for the database; routes don't need to change.
- [ ] **Auth0 API audience** (optional): create an API in the tenant so the backend verifies JWTs locally
      instead of calling `/userinfo`.
- [ ] **Team README:** update the plan for the 3D campus route, own-room palaces and the two-way quiz.
