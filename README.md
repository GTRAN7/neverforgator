# NeverForgator: a method-of-loci memory palace maker

**Live at https://neverforgator.study**

Make memorization easier with an AI-assisted memory palace built in real places you know. Paste notes
(or snap a photo, PDF or voice memo of them) and Gemini cuts them into ideas, gives each one a stop in a
room, and writes a vivid scene that ties the idea to that spot. Start from the built-in Reitz Union
panoramas or upload your own room photos and 3D scans, walk through the palace, and quiz yourself until it
sticks. Palaces are saved to your account, with spaced review reminders.

Built at SwampHacks XII.

### Team

* Kira Luna Nichtawitz: user authentication, UX, team management
* Eric Tran: Gemini API integration & middleware
* Natasha Antoniuk: React frontend and UI design
* Thomas McLaughlin: Backend & database

## What it does

The app has two modes that share one Auth0 login.

- **3D studio** (the default; `frontend/src/`, `backend/app/studio/`): palaces inside real places. The
  built-in Reitz Union route (three panoramas), or your own panoramas, photos and 3D scans. Gemini cuts
  your notes into ideas, finds a stop for each in the photos, and writes a scene, a sound-alike "hook" and
  a doodle per stop. Also: walk-through, a two-round quiz, spaced review, reusable places, note import from
  photos, PDFs and voice, and a 1-minute onboarding tour. Palaces are saved in the backend.
  Details: [docs/how-it-works.md](docs/how-it-works.md).
- **Campus mode** (`frontend/src/palace/`, the "Campus mode" button, or `?mode=campus`): a walk around
  UF campus with photo signs, pins, a dashboard, night mode and accessibility settings. Palaces are saved
  **in the browser** (`localStorage` + IndexedDB), with JSON export/import.

## Tech stack

| Area | Tool | Purpose |
| --- | --- | --- |
| Frontend | React 19 + Vite, three.js (react-three-fiber, Spark for 3D scans) | App UI, room viewer, walkthrough, quiz |
| Backend | Python + FastAPI | API, Gemini calls, auth checks, database access, serves the built site |
| Authentication | Auth0 | Sign up, log in, access tokens for the API |
| AI | Google Gemini API | Note splitting, scenes, stop labels, doodles, note import (OCR / speech) |
| Database | PostgreSQL (SQLite locally) | Users, palaces, rooms, stops, quiz scores, daily usage |
| Database access | SQLAlchemy + Alembic | Tables as Python classes; migrations that build and change the tables |
| Tests | pytest | Backend tests (throwaway database, mock AI) |
| Hosting | DigitalOcean Droplet + Caddy | One droplet runs everything; Caddy handles HTTPS |
| Domain | GoDaddy | https://neverforgator.study (`www.` redirects to it) |

### Architecture (production)

```
Browser ──HTTPS──▶ Caddy (:443, TLS; :80 and www. redirect)
                     │
                     ▼
               uvicorn / FastAPI (localhost only, not reachable from outside)
                 ├── /api/...          studio API (Auth0 token required, except /api/status, /api/describe)
                 ├── /me, /palaces, /locations   campus-route API
                 ├── /files/, /cache/  room photos, scans, crops, generated pictures (public, random names)
                 └── /                 the built frontend (frontend/dist)
                     │
                     ├──▶ PostgreSQL
                     ├──▶ backend/data/   uploaded rooms + Gemini cache (on the droplet's disk)
                     ├──▶ Gemini API      (key only on the server)
                     └──▶ Auth0           (public keys, to verify tokens)
```

- FastAPI serves the built site from `frontend/dist` when that folder exists (`backend/app/main.py`), so
  the app and the API are the **same origin**. The frontend calls relative URLs (`/api/...`); in
  development Vite's proxy forwards them to port 8000.
- The Gemini API key lives only on the backend and never reaches the browser.
- The backend checks each request's Auth0 token (`backend/app/auth.py`) and links data to the user's
  Auth0 `sub`. The first request from a new user creates their `users` row.
- `DEV_AUTH=true` skips Auth0 and trusts an `X-Dev-User` header instead. It's for local testing only.
  **Production runs with `DEV_AUTH=false`**; `GET https://neverforgator.study/me` without a token must
  return 401.

## Running it locally

**Requirements:**
- [Node.js](https://nodejs.org/) 20.19+ or 22.12+ (we use Node 22) and npm
- [Python](https://www.python.org/) 3.10+

```bash
git clone https://github.com/GTRAN7/neverforgator.git
cd neverforgator
npm run setup                          # frontend packages, backend/.venv, tables, campus locations
cp backend/.env.example backend/.env   # then fill it in (see below). Never commit .env
cp frontend/.env.local.example frontend/.env.local   # then fill it in (see below)
npm run dev                            # FastAPI on :8000, app on http://localhost:5173
npm test                               # backend tests
```

The built-in Reitz route and the cell example are created on startup from `backend/app/data/reitz/`, so
nobody needs Gemini for them. Without `GEMINI_API_KEY` the studio runs in **mock AI** mode (placeholder
facts and scenes).

### `frontend/.env.local`

Gitignored, so each device needs its own copy:

```
VITE_AUTH0_DOMAIN=dev-sknccm5343cwp4hh.us.auth0.com
VITE_AUTH0_CLIENT_ID=LIZYqIyjABCSklIoqaGpdMTtvTEIV7O1
VITE_AUTH0_AUDIENCE=https://loci-api
```

None of these are secrets: a browser app ships them to every visitor anyway. Everything starting with
`VITE_` ends up in the public JavaScript, so **never put a secret here**. They're also in the Auth0
dashboard under **Applications → SwampHacks Project → Settings**. Without `VITE_AUTH0_DOMAIN` the app runs
with no login (the backend then needs `DEV_AUTH=true`).

### `backend/.env`

| Variable | Local | Production |
| --- | --- | --- |
| `DATABASE_URL` | Empty = local SQLite file (`backend/loci.db`) | The Postgres connection string (the code switches it to the `pg8000` driver and turns on SSL unless `sslmode=disable`) |
| `AUTH0_DOMAIN` | `dev-sknccm5343cwp4hh.us.auth0.com` | same |
| `AUTH0_AUDIENCE` | `https://loci-api` | same |
| `DEV_AUTH` | `true` (skip Auth0) or `false` | **`false`** |
| `CORS_ORIGINS` | `http://localhost:5173` | `https://neverforgator.study` |
| `GEMINI_API_KEY` | Optional (empty = mock AI) | Set |
| `GEMINI_TEXT_MODEL` | Optional; default picks the newest flash-lite | `gemini-3.1-flash-lite` |
| `PICTURES` | `doodle`, `gemini` (real images, needs billing) or `placeholder` | `doodle` |
| `DATA_DIR` | Optional; default `backend/data/` | Where uploads and the Gemini cache live |

### Manual backend setup (instead of `npm run setup`)

On Mac / Linux, from the repo root:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head            # builds the tables
python -m app.seed              # loads the campus locations
fastapi dev main.py             # starts the server with auto-reload
```

On Windows (PowerShell), use `python -m venv .venv`, `.venv\Scripts\Activate.ps1` and
`copy .env.example .env`; the other commands are the same. If PowerShell blocks `Activate.ps1`, run
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

Then open **http://localhost:8000/docs** to try every endpoint. With `DEV_AUTH=true`, type any name in
the `x-dev-user` box to act as that user.

## Production

The site runs on one DigitalOcean droplet from the `main` branch. Caddy terminates HTTPS and proxies to
uvicorn, which listens on localhost only. FastAPI serves the API, the uploaded files and the built
frontend.

<!-- TODO: fill in from the droplet: where the repo is checked out, the Caddyfile path, and the
     service that runs uvicorn (e.g. a systemd unit name). Better: commit them under deploy/. -->

### Deploying an update

After a PR is merged into `main`, on the droplet:

```bash
git pull                                   # in the repo checkout
npm --prefix frontend ci && npm run build  # rebuilds frontend/dist (needs frontend/.env.local with the VITE_ values)
cd backend
.venv/bin/pip install -r requirements.txt  # if requirements.txt changed
.venv/bin/alembic upgrade head             # if there are new migrations
.venv/bin/python -m app.seed               # if app/data/locations.json changed
# then restart the backend service
```

The shared Reitz palaces rebuild themselves on startup whenever a file in `backend/app/data/reitz/`
changed. After deploying, check:

- `curl https://neverforgator.study/health` → `{"status":"ok"}`
- `curl -i https://neverforgator.study/me` → **401** (proves `DEV_AUTH` is off)
- `curl https://neverforgator.study/api/status` → `"mock": false`

### What to back up

Two things hold user data: the **database**, and **`backend/data/`** (or `DATA_DIR`) on the droplet's
disk, which has every uploaded room photo / 3D scan, stop crop and generated picture. Losing either one
breaks people's palaces.

## Auth0

- The frontend uses the [Auth0 React SDK](https://github.com/auth0/auth0-react). `src/main.jsx` wraps the
  app in `<Auth0Provider>` with the domain, client ID and audience from `.env.local`.
- **Log in** and **Sign up** redirect to Auth0's hosted login page. The Auth0 application is a **Single
  Page Application**, so it has no client secret.
- To call the backend, the frontend gets an **access token** for the Auth0 API (**Applications → APIs →
  Loci API**, identifier `https://loci-api`, RS256) and sends it as `Authorization: Bearer <token>`. The
  backend downloads Auth0's public keys and checks each token's signature, issuer, audience and expiry.
  The identifier is just a name; it's never visited, and changing it means creating a new API, so it
  keeps the `loci` name.
- **Allowed URLs:** the app's URL must be listed in **Applications → SwampHacks Project → Settings** under
  **Allowed Callback URLs**, **Allowed Logout URLs** and **Allowed Web Origins**. That's
  `https://neverforgator.study` and `http://localhost:5173`. `npm run dev` is pinned to port 5173 with
  `--strictPort`, so if the port is taken Vite fails instead of moving to a port Auth0 doesn't know.
- Users show up in the Auth0 dashboard under **User Management → Users**.
- The Auth0 tenant (`dev-sknccm5343cwp4hh`) belongs to Kira's account. Ask to be invited if you need to
  change settings or view users.
- To test the API in `/docs` with a real token: Auth0 → APIs → Loci API → **Test** tab gives a token.
  Click **Authorize** in `/docs` and paste it.

### Auth0 MCP server (optional)

`.mcp.json` sets up the [Auth0 MCP server](https://github.com/auth0/auth0-mcp-server) so Claude Code can
manage the Auth0 tenant (apps, URLs, logs). Each device has to authorize it once:

```bash
npx @auth0/auth0-mcp-server init
```

## API

Open `/docs` on a running backend for every endpoint with its request and response shapes. Someone
else's palace always returns **404**, so the API never confirms it exists.

### Studio API (`backend/app/studio/router.py`)

What the 3D studio uses. Every route needs a login except `/api/status` and `/api/describe` (which is
rate-limited per IP address). All studio routes share a burst limit of 120 calls a minute per user.

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/status` | Mock mode, models, size caps |
| GET | `/api/usage` | Today's fair-use quota |
| POST | `/api/import` | Photo / PDF / recording of notes → text |
| POST | `/api/describe` | Campus mode's AI buttons: 2-3 sentences about a subject or term |
| GET / POST | `/api/palaces` | My palaces plus the shared ones / create a palace |
| GET / PATCH / DELETE | `/api/palaces/{id}` | Open / rename / delete |
| POST | `/api/palaces/{id}/copy` | Start my own copy of a shared palace (e.g. the Reitz route) |
| POST | `/api/palaces/{id}/rooms` | Upload panoramas, photos or 3D scans |
| PATCH / DELETE | `/api/palaces/{id}/rooms/{roomId}` | Rename or flip / delete a room |
| PUT | `/api/palaces/{id}/rooms/order` | Reorder rooms |
| POST | `/api/palaces/{id}/spots` | Add a stop |
| PATCH / DELETE | `/api/palaces/{id}/spots/{spotId}` | Rename or move / delete a stop |
| PUT | `/api/palaces/{id}/spots/order` | Reorder the walk |
| POST | `/api/palaces/{id}/spots/{spotId}/label` | Gemini names what was clicked |
| PUT | `/api/palaces/{id}/spots/{spotId}/idea` | Edit a stop's idea (scene is rewritten) |
| POST | `/api/palaces/{id}/fill` | Notes → the whole palace |
| POST | `/api/palaces/{id}/pictures`, `.../spots/{spotId}/image` | Draw pictures |
| POST | `/api/palaces/{id}/spots/{spotId}/result` | Record a quiz answer |
| POST | `/api/palaces/{id}/reviews` | Finished quiz → next review date |
| POST | `/api/palaces/{id}/weirder`, `.../spots/{spotId}/weirder` | Weirder scenes for missed stops |

Daily quotas per user (fills, imports, scenes, labels, pictures) and size caps are in
`backend/app/studio/limits.py` and listed in [docs/how-it-works.md](docs/how-it-works.md).

### Campus-route API (`backend/app/routers/`)

The original API for palaces on the fixed campus route. Campus mode doesn't call it right now (see
[Known issues](#known-issues)), but it's live and tested.

| Method | Path | Login? | What it does |
| --- | --- | --- | --- |
| GET | `/health` | no | Is the server up? |
| GET | `/locations` | no | Campus stops in walking order |
| GET | `/me` | yes | My profile (first call creates my account row) |
| POST | `/palaces` | yes | Save a palace with its stops and questions |
| GET | `/palaces` | yes | My palaces, newest first, with stop counts |
| GET | `/palaces/{id}` | yes | One palace: stops in order, each with location and questions |
| DELETE | `/palaces/{id}` | yes | Delete a palace (stops, questions, scores go with it) |
| POST | `/palaces/{id}/attempts` | yes | Save a quiz score `{"score": 7, "total": 9}` |
| GET | `/palaces/{id}/attempts` | yes | Score history, oldest first |

`POST /palaces` body:

```json
{
  "title": "Bio 101: Cells",
  "source_text": "the original notes (optional)",
  "stops": [
    {
      "concept": "Mitochondria",
      "association": "A giant condor pedals a generator on top of Library West",
      "questions": [
        { "question": "What do mitochondria produce?", "answer": "ATP" },
        {
          "question": "Where did you put mitochondria?",
          "answer": "Library West",
          "type": "multiple_choice",
          "choices": ["Library West", "Reitz Union", "Lake Alice"]
        }
      ]
    }
  ]
}
```

Stops are placed on the route in the order you send them, unless a stop has a `location_id` (from
`GET /locations`). `type` defaults to `short_answer`; for `multiple_choice`, `answer` must be one of
`choices`. The whole palace saves in one transaction.

## Data model

The tables are defined in `backend/app/models.py`. That file is the source of truth. Summary:

- `users`: one row per Auth0 account (`auth0_sub`, `email`, `name`). A `system` user owns the shared palaces.
- `palaces`: `user_id`, `title`, `source_text` (the notes), plus studio fields: `place`, `style`,
  `flavor`, `template` (shared with everyone), `built_in`, `sample`, `copied_from`, `fill_report`,
  `next_review_at`.
- `rooms`: a palace's panoramas, photos and 3D scans, in walking order (`file` is in `backend/data/palaces/<id>/`).
- `palace_stops`: one idea at one stop, in walking order (`stop_order`; not `order`, a reserved word in
  SQL). A stop is either at a campus `location_id` or at a spot in a `room_id` (a `direction`, or a 3D
  `point` + `view_from`), with its `concept`, scene (`association`), `hook`, `label`, `crop`, `image`,
  `weirdness` and `misses`.
- `quiz_questions`: questions attached to a stop (campus-route API).
- `quiz_attempts`: quiz scores (`score`, `total`, `taken_at`).
- `locations`: the 9 hand-picked campus landmarks of the campus route, from
  `backend/app/data/locations.json` (edit it, then run `python -m app.seed`).
- `usage_counts`: how many AI actions each user used per day (fair-use limits).

Deleting a palace also deletes its rooms, stops, questions and scores.

### Changing the schema

Never edit a migration that already ran on the production database. Instead, from `backend/`:

```bash
# 1. edit app/models.py
alembic revision --autogenerate -m "add palace description"
# 2. read the new file in alembic/versions/ and check it
alembic upgrade head
```

## Project structure

```
neverforgator/
├── package.json                # npm run setup / dev / test / build for the whole repo
├── .mcp.json                   # Auth0 MCP server config for Claude Code (optional)
├── docs/                       # how-it-works.md, demo.md
├── design/                     # Kira's design mockups
├── uf-mind-palace/             # the original campus-mode prototype (superseded by frontend/src/palace/)
├── frontend/                   # React + Vite app
│   ├── .env.local              # Auth0 settings (not committed)
│   └── src/
│       ├── main.jsx            # Auth0Provider; picks studio or campus mode
│       ├── App.jsx, api.js     # 3D studio and its API client
│       ├── components/, lib/   # studio UI and helpers
│       └── palace/             # campus mode
└── backend/                    # FastAPI app
    ├── .env                    # settings and secrets (not committed)
    ├── data/                   # uploaded rooms, crops, Gemini cache (not committed)
    ├── alembic/versions/       # migrations
    ├── tests/                  # pytest
    └── app/
        ├── main.py             # creates the app, CORS, security headers, serves files and the built site
        ├── config.py           # reads settings from .env
        ├── db.py, models.py, schemas.py
        ├── auth.py             # checks Auth0 tokens, finds or creates the user
        ├── routers/            # campus-route API: users.py, locations.py, palaces.py
        ├── data/               # locations.json, the built-in Reitz route (reitz/)
        └── studio/             # studio API: Gemini, fill, rooms, limits, shared palaces
```

## Known issues

- **Campus mode doesn't save to the account.** `src/palace/account.js` (save, open, delete account copies)
  and `src/palace/api.js` (`useApi`) are still in the repo, but nothing passes `account.api` to the
  dashboard anymore, so campus palaces stay in the browser. To bring it back, pass `api: useApi()` in the
  `account` object in `CampusApp.jsx`, and build with `VITE_API_URL=https://neverforgator.study` (when it's
  empty, `useApi` falls back to `http://localhost:8000`).
- Campus mode and the studio are still two separate apps sharing one login.
