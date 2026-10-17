# Never Forgator
Make memorization easier with a AI assisted memory palace creation tool centered around UF campus.

### Project description
A memory palace maker built on the UF campus. Upload notes, a list or a topic, and AI pulls out the key concepts. Each concept is placed at a real campus location on an interactive map. A guided walkthrough helps you memorize the route, and a quiz helps the material stick. You can save your palaces and come back to them from a dashboard.

> **Naming:** "Loci" was a temporary name. You'll still see it in code and config (`Loci API`, `https://loci-api`, `loci.db`). Those will be renamed later. Until then, use the names exactly as they appear in this README.

### Team:
Kira Luna Nichtawitz (UX Designer), Natasha Antoniuk (Frontend developer), Eric Tran (Gemini API Integration/middleware specialist), Thomas McLaughlin (Backend developer).

## How it works

1. **Sign in.** Accounts are handled by Auth0.
2. **Add material.** Paste notes, upload a file or a list, or just type a topic.
3. **Generate concepts.** Gemini pulls out the main concepts, puts them in order, and writes a vivid image that links each concept to its location.
4. **Build the palace.** Each concept goes to a stop on a fixed walking route around UF campus (Library West, then Smathers Library, then the Plaza of the Americas, and so on). The stops are shown on an interactive 2D map.
5. **Walkthrough.** A guided tour visits the stops in order and shows each concept and its image.
6. **Quiz.** Questions go both ways: "What's at Century Tower?" and "Where did you put photosynthesis?"
7. **Dashboard.** Saved palaces can be reopened, reviewed or quizzed again.

### MVP vs. stretch goals

| MVP (hackathon demo) | Stretch goals |
| --- | --- |
| Text / topic input | File uploads (PDF, images) |
| Concept extraction + placement on a fixed route | Choosing or customizing the route |
| 2D interactive campus map | 3D campus rendering |
| Step-by-step walkthrough | Narration / audio walkthrough |
| Quiz generated with the palace | Spaced-repetition review reminders |
| Save + reopen from dashboard | Sharing palaces with other users |

## Integrations & tech stack

| Area | Tool | Purpose |
| --- | --- | --- |
| Frontend | React + Vite | App UI, map, walkthrough, quiz, dashboard |
| Map | Leaflet + OpenStreetMap *or* custom SVG campus map (TBD) | 2D interactive campus map |
| Auth | Auth0 | Sign up, log in, access tokens for the API |
| AI | Google Gemini API (Google Cloud) | Concept extraction, associations, quiz generation |
| Backend | Python + FastAPI | API, Gemini calls, auth checks, database access |
| Database access | SQLAlchemy + Alembic | Tables as Python classes; migrations that build and change the tables |
| Database | PostgreSQL (Neon) for the shared database, SQLite locally | Users, campus route, palaces, stops, quiz questions, quiz scores |
| Tests | pytest | Backend tests (use a throwaway database) |
| Domain | GoDaddy | Production domain name |
| Hosting | TBD | Running the frontend and backend (the database is on Neon) |

### Architecture

```
React app ──(Auth0 access token)──▶ FastAPI ──▶ PostgreSQL (Neon) / SQLite locally
    │                                   │
    └──── Auth0 login ◀─────────────────┤ verifies tokens
                                        └──▶ Gemini API (server-side only)
```

- The Gemini API key lives only on the backend and is never sent to the browser. The Gemini code goes inside the FastAPI backend (Python).
- The backend checks each request's Auth0 token (`backend/app/auth.py`) and links data to the user's Auth0 `sub` (their unique user ID). The first request from a new user creates their `users` row.
- For local testing, `DEV_AUTH=true` in `backend/.env` skips Auth0 and trusts an `X-Dev-User` header instead. **Never deploy with `DEV_AUTH=true`.**

### Data model

The tables are defined in `backend/app/models.py`. That file is the source of truth. Summary:

- `users`: one row per Auth0 account: `id`, `auth0_sub`, `email`, `name`, `created_at`
- `locations`: hand-picked campus landmarks (the fixed walking route): `id`, `name`, `lat`, `lng`, `route_order`, `description`
- `palaces`: `id`, `user_id`, `title`, `source_text`, `created_at`
- `palace_stops`: one concept at one location: `id`, `palace_id`, `location_id`, `stop_order`, `concept`, `association`
  - It's called `stop_order`, not `order`, because `ORDER` is a reserved word in SQL. Two stops in the same palace can't have the same `stop_order`.
- `quiz_questions`: attached to a stop: `id`, `stop_id`, `question`, `answer`, `type` (`short_answer` or `multiple_choice`), `choices` (list of options, multiple choice only)
- `quiz_attempts`: `id`, `palace_id`, `user_id`, `score`, `total`, `taken_at`

Deleting a palace also deletes its stops, questions and scores.

### Campus route

The route has 9 stops, in walking order:

1. Library West
2. Smathers Library
3. Plaza of the Americas
4. Turlington Hall
5. University Auditorium
6. Century Tower
7. Marston Science Library
8. Reitz Union
9. Lake Alice

It lives in `backend/app/data/locations.json`, with coordinates and descriptions. To change it, edit the file, then run `python -m app.seed` from `backend/`.

## Roles

| Role | Owner | Responsibilities |
| --- | --- | --- |
| **Frontend** | Natasha | React pages and routing, interactive campus map, dashboard, connecting the UI to the API with Auth0 access tokens |
| **Design / UX** | Kira | Wireframes, visual style, walkthrough and quiz screens, campus route (`locations.json`), demo flow, Auth0 tenant |
| **Backend & database** | Thomas | FastAPI app, SQLAlchemy models and Alembic migrations, palace/quiz endpoints, Neon database, hosting and deployment |
| **API integration** | Eric | Gemini prompts and structured JSON output (in Python, in the backend), turning Gemini output into the `POST /palaces` format and saving it with `create_palace_for_user`, input validation, rate limiting, error handling |

## API

The backend runs at http://localhost:8000 locally. Open **http://localhost:8000/docs** to see every endpoint and try them in the browser.

| Method | Path | Login? | What it does |
| --- | --- | --- | --- |
| GET | `/health` | no | Is the server up? |
| GET | `/locations` | no | Campus stops in walking order (for the map) |
| GET | `/me` | yes | My profile (first call creates my account row) |
| POST | `/palaces` | yes | Save a palace with its stops and questions |
| GET | `/palaces` | yes | Dashboard list: my palaces, newest first, with stop counts |
| GET | `/palaces/{id}` | yes | Open one palace: stops in order, each with location and questions |
| DELETE | `/palaces/{id}` | yes | Delete a palace (stops, questions, scores go with it) |
| POST | `/palaces/{id}/attempts` | yes | Save a quiz score `{"score": 7, "total": 9}` |
| GET | `/palaces/{id}/attempts` | yes | Score history, oldest first |

Someone else's palace always returns **404**, so the API never confirms it exists.

### Saving a palace (the contract between frontend, Gemini and backend)

`POST /palaces` body. Gemini's output should also be turned into this format:

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

- Stops are placed on the route **in the order you send them**: concept 1 goes to route stop 1, and so on.
  To pick a place yourself, add `"location_id"` (from `GET /locations`) to a stop.
- `type` defaults to `short_answer`. For `multiple_choice`, `answer` must be one of `choices`.
- The whole palace saves in one transaction: if anything is invalid, nothing is saved.
- For the Gemini endpoint: call `create_palace_for_user(db, user, PalaceCreate(...))` from
  `backend/app/routers/palaces.py` to save the AI output with the same checks.

## Roadmap

1. **Setup:** repo, React app, Auth0 login ✅
2. **Design:** wireframes, campus route (9 stops, see above), choose the map approach
3. **Backend skeleton:** FastAPI server, database schema, Auth0 token checks, `/me` endpoint ✅
4. **Connect frontend to API:** Auth0 audience in the frontend, call the API with access tokens
5. **AI pipeline:** Gemini prompt → structured JSON (concepts, associations, quiz) → saved as a palace
6. **Map + walkthrough:** show the palace's stops on the map and step through them in order
7. **Quiz:** questions in both directions, with scoring (saving scores is already in the API)
8. **Dashboard:** list, open and delete saved palaces (endpoints done, UI to do)
9. **Deploy:** pick a host for the frontend and backend, move to the Neon database, point the GoDaddy domain at them, add the production URL in Auth0
10. **Polish + demo:** sample palaces, error and loading states, pitch

## Progress

- [x] React frontend scaffolded with Vite (`frontend/`)
- [x] Auth0 sign-in, sign-up and log-out working locally
- [x] Project idea / description
- [x] Backend: FastAPI app, database tables, palace and quiz endpoints, tests
- [x] Campus route (first version, 9 stops)
- [x] Auth0 API created (`Loci API`, identifier `https://loci-api`) and set in `backend/.env`
- [x] Frontend sends Auth0 access tokens to the API (`VITE_AUTH0_AUDIENCE`, `main.jsx`, `frontend/src/palace/api.js`)
- [x] Frontend bridge: save palaces to the account, open them from the dashboard, quiz scores saved (see "Frontend ↔ backend" below)
- [ ] Shared Neon database
- [ ] Wireframes
- [ ] Gemini integration
- [ ] Map, walkthrough, quiz, dashboard
- [ ] Hosting decision, deployment + domain

## Project structure

```
swamphacks/
├── .mcp.json                   # Auth0 MCP server config for Claude Code (optional)
├── frontend/                   # React + Vite app
│   ├── .env.local              # Auth0 + API settings (not committed, see setup below)
│   └── src/
│       ├── main.jsx            # Wraps the app in Auth0Provider
│       └── App.jsx             # Sign-in page / signed-in view
└── backend/                    # FastAPI app
    ├── .env.example            # Copy to .env (not committed) and fill in
    ├── requirements.txt        # Python packages
    ├── main.py                 # Entry point for `fastapi dev main.py`
    ├── alembic/versions/       # Migrations: step-by-step instructions that build the tables
    ├── tests/                  # Automated tests (pytest)
    └── app/
        ├── main.py             # Creates the app, CORS, plugs in the routes
        ├── config.py           # Reads settings from .env
        ├── db.py               # Database connection; one session per request
        ├── models.py           # The tables, as Python classes
        ├── schemas.py          # What requests and responses must look like (validation)
        ├── auth.py             # Checks Auth0 tokens, finds or creates the user
        ├── routers/            # The endpoints: users.py, locations.py, palaces.py
        ├── data/locations.json # The campus route
        └── seed.py             # Loads locations.json into the database
```

## Setting up on a new device

**Requirements:**
- [Node.js](https://nodejs.org/) 20.19+ or 22.12+ (we use Node 22) and npm, for the frontend
- [Python](https://www.python.org/) 3, for the backend

Clone the repo first:

```bash
git clone <repo-url>
cd swamphacks
```

### Frontend

1. Install dependencies:

   ```bash
   cd frontend
   npm install
   ```

2. Create `frontend/.env.local`. This file is gitignored, so each device needs its own copy:

   ```
   VITE_AUTH0_DOMAIN=dev-sknccm5343cwp4hh.us.auth0.com
   VITE_AUTH0_CLIENT_ID=LIZYqIyjABCSklIoqaGpdMTtvTEIV7O1
   VITE_AUTH0_AUDIENCE=https://loci-api
   VITE_API_URL=http://localhost:8000
   ```

   None of these are secrets. A browser app has to ship them to every visitor anyway. You can also find the Auth0 values in the Auth0 dashboard under **Applications → SwampHacks Project → Settings**.

3. Start the dev server:

   ```bash
   npm run dev
   ```

   Then open http://localhost:5173.

### Backend

From the repo root, on Mac:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # then open .env and check the values
alembic upgrade head            # builds the tables
python -m app.seed              # loads the campus locations
fastapi dev main.py             # starts the server with auto-reload
```

On Windows (PowerShell):

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env          # then open .env and check the values
alembic upgrade head
python -m app.seed
fastapi dev main.py
```

> If PowerShell blocks `Activate.ps1`, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

Then open **http://localhost:8000/docs**. With `DEV_AUTH=true`, type any name in the `x-dev-user` box to act as that user.

`backend/.env` settings (see `.env.example`):

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Leave empty to use a local SQLite file (`loci.db`). Paste the Neon connection string to use Postgres |
| `AUTH0_DOMAIN` | `dev-sknccm5343cwp4hh.us.auth0.com` (same as the frontend) |
| `AUTH0_AUDIENCE` | `https://loci-api` (the Auth0 API identifier) |
| `DEV_AUTH` | `true` skips Auth0 for local testing. Must be `false` when deployed |
| `CORS_ORIGINS` | Websites allowed to call the API, comma-separated. `http://localhost:5173` locally |

Run the tests (they use a throwaway database):

```bash
pytest
```

## Auth0 integration

### How it works

- The app uses the official [Auth0 React SDK](https://github.com/auth0/auth0-react) (`@auth0/auth0-react`).
- `src/main.jsx` wraps the app in `<Auth0Provider>`, which reads the domain and client ID from `.env.local`. Vite only exposes variables that start with `VITE_` to the browser.
- Components call the `useAuth0()` hook to get `isAuthenticated`, `user`, `isLoading`, `loginWithRedirect()` and `logout()`. See `src/App.jsx` for an example.
- **Log in** and **Sign up** redirect to Auth0's hosted login page. Sign up passes `screen_hint: 'signup'` so the page opens on the sign-up form. After you sign in, Auth0 redirects back to the app and the SDK keeps the session.
- The Auth0 application is a **Single Page Application**, so it doesn't use a client secret.
- To call the backend, the frontend gets an **access token** for the Auth0 API and sends it as `Authorization: Bearer <token>`. The backend downloads Auth0's public keys and checks each token's signature, issuer (our tenant), audience (`https://loci-api`) and expiry. The user's Auth0 ID (`sub`) links them to their data. The backend never sees passwords.

### Auth0 API (access tokens for the backend)

The Auth0 API is already created in the tenant: **Applications → APIs → Loci API**, identifier `https://loci-api`, RS256. The identifier is just a name. It's never visited, and changing it means creating a new API, so it keeps the `loci` name.

Done in the frontend:

- `src/main.jsx` passes `VITE_AUTH0_AUDIENCE` to the Auth0 provider. Users need to log out and back in once after the audience is added.
- `src/palace/api.js` (`useApi`) calls `VITE_API_URL` with `Authorization: Bearer <token>`. In dev it also sends `X-Dev-User: <the user's Auth0 sub>`, so with `DEV_AUTH=true` each signed-in user still gets their own data.
- On sign-in the app calls `/me` once, which creates the user's row.

To test real tokens: set `DEV_AUTH=false` in `backend/.env`, restart the backend and sign in again.
To test in `/docs` instead: Auth0 → APIs → Loci API → **Test** tab gives a token. Click
**Authorize** in `/docs` and paste it.

### Frontend ↔ backend (the bridge)

Palaces are still edited and autosaved in the browser (`localStorage` + IndexedDB for photos), because the API can't update a saved palace yet. Signed-in users can keep **copies** in their account:

- **☰ menu → Save to account** uploads the palace (`POST /palaces`). After that the button says **Update account copy**: it uploads a new copy and deletes the old one, since there's no update endpoint (that copy's score history is lost).
- **Dashboard → In your account** lists account palaces that aren't in this browser (`GET /palaces`), with **Open** (downloads it into this browser) and **Delete** (`DELETE /palaces/{id}`). Local palaces with a copy say "in your account".
- Finishing a quiz on a palace with an account copy saves the score (`POST /palaces/{id}/attempts`).

How a palace is converted (`src/palace/account.js`):

- Each stop becomes a backend stop. A stop whose name matches a route location (e.g. Smathers Library, Century Tower) keeps that location; the others take the unused route locations in order. So the account can hold **at most 9 stops** per palace (the route's length).
- `concept` / `association` fall back to the subject, description or place name when empty (the API requires both). Cards with a question and an answer become `short_answer` questions.
- The whole frontend palace (places, pins, stars, hidden pins, appearance) is also saved as JSON in `source_text` (`{"app": "never-forgator", ...}`), so **Open** restores it exactly. Photos someone uploaded stay in the browser that added them; built-in campus photos work everywhere.
- A palace made elsewhere (e.g. by the Gemini endpoint) has no such JSON: it opens with the route locations as stops and its questions as cards laid out in a grid (campus photos are matched by location name).

When the backend gets a `PUT /palaces/{id}` and fields for pins, photos and custom places, `account.js` is the one file to change.

### Using it in development

- The app has to run on **http://localhost:5173**. That's the only URL registered in Auth0 for sign-in, log-out and allowed origins. `npm run dev` is pinned to that port with `--strictPort`. If the port is already taken, Vite fails instead of moving to another port, so stop whatever is using 5173.
- To test, click **Sign up** and create a user with any email. Test users show up in the Auth0 dashboard under **User Management → Users**, and you can delete them there.
- To use a different URL or port, or to deploy, add the new URL in the Auth0 dashboard under **Applications → SwampHacks Project → Settings**. It goes in **Allowed Callback URLs**, **Allowed Logout URLs** and **Allowed Web Origins**.
- Dashboard access: the Auth0 tenant (`dev-sknccm5343cwp4hh`) belongs to Kira's account. Ask to be invited to the tenant if you need to change settings or view users.

### Auth0 MCP server (optional)

`.mcp.json` sets up the [Auth0 MCP server](https://github.com/auth0/auth0-mcp-server) so Claude Code can manage the Auth0 tenant (create apps, update URLs, read logs). Each device has to authorize it once:

```bash
npx @auth0/auth0-mcp-server init
```

## Database

### Switching to PostgreSQL (Neon)

SQLite (`backend/loci.db`) is fine for local work. For the shared and deployed database:

1. Create a free project at neon.tech and copy the connection string.
2. Paste it as `DATABASE_URL` in `backend/.env` (the code switches it to the `pg8000` driver and turns on SSL for you).
3. `alembic upgrade head` then `python -m app.seed`.

### Changing the schema

Never edit a migration that already ran on the shared database. Instead, from `backend/`:

```bash
# 1. edit app/models.py
alembic revision --autogenerate -m "add palace description"
# 2. read the new file in alembic/versions/ and check it
alembic upgrade head
```

## Deploying

Hosting isn't decided yet. Whatever we choose:

- **Backend:** any Python host works. Build command `pip install -r requirements.txt`, start command
  `alembic upgrade head && python -m app.seed && uvicorn main:app --host 0.0.0.0 --port $PORT` (run from `backend/`).
  Set `DATABASE_URL` (Neon), `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `CORS_ORIGINS` (the real frontend URL) and
  **`DEV_AUTH=false`**. Check it with `GET /me` and no token: it must return 401.
- **Frontend:** set the same `VITE_` variables as `.env.local`, with `VITE_API_URL` pointing at the deployed backend.
- **Auth0:** add the production frontend URL to **Allowed Callback URLs**, **Allowed Logout URLs** and **Allowed Web Origins**.
- **Domain:** point the GoDaddy domain at the frontend host.
