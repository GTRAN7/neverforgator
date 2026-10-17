# Loci backend (FastAPI + PostgreSQL)

The API that stores users, the campus route, memory palaces, quiz questions and quiz scores.
Owner: Thomas.

```
React app ──(Auth0 access token)──▶ FastAPI ──▶ PostgreSQL (or SQLite locally)
```

## Run it on your laptop (Windows, PowerShell)

From the `backend` folder:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env          # then open .env and check the values
alembic upgrade head            # builds the tables
python -m app.seed              # loads the campus locations
fastapi dev main.py             # starts the server with auto-reload
```

Open **http://localhost:8000/docs**. Every endpoint is listed there and you can try each one with
**Try it out**. With `DEV_AUTH=true`, type any name in the `x-dev-user` box to act as that user.

Run the tests (they use a throwaway database, not yours):

```powershell
pytest
```

> If PowerShell blocks `Activate.ps1`, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

## Files

| File | What it does |
| --- | --- |
| `main.py` | Entry point for `fastapi dev main.py` |
| `app/main.py` | Creates the app, CORS, plugs in the routes |
| `app/config.py` | Reads settings from `.env` |
| `app/db.py` | Database connection; one session per request |
| `app/models.py` | The tables, as Python classes |
| `app/schemas.py` | What requests and responses must look like (validation) |
| `app/auth.py` | Checks Auth0 tokens, finds or creates the user |
| `app/routers/` | The endpoints: `users.py`, `locations.py`, `palaces.py` |
| `app/data/locations.json` | The campus route. Edit it, then re-run `python -m app.seed` |
| `app/seed.py` | Loads `locations.json` into the database |
| `alembic/versions/` | Migrations: step-by-step instructions that build the tables |
| `tests/` | Automated tests |

## Endpoints

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

### Saving a palace (the contract with Eric and Natasha)

`POST /palaces` body. This is also the shape Gemini's output should be turned into:

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
- For Eric's Gemini endpoint: call `create_palace_for_user(db, user, PalaceCreate(...))` from
  `app/routers/palaces.py` to save the AI output with the same checks.

## Auth0 setup (one time, in Kira's tenant)

The React app can already log in, but to call this API it needs an **access token for the API**.

1. Auth0 dashboard → **Applications → APIs → Create API**.
   Name: `Loci API`. Identifier: `https://loci-api` (just a name; it's never visited).
   Signing algorithm: RS256.
2. Put the same identifier in `backend/.env` as `AUTH0_AUDIENCE`.
3. Frontend (Natasha): add the audience in `frontend/.env.local`

   ```
   VITE_AUTH0_AUDIENCE=https://loci-api
   VITE_API_URL=http://localhost:8000
   ```

   and pass it to the provider in `src/main.jsx`:

   ```jsx
   authorizationParams={{
     redirect_uri: window.location.origin,
     audience: import.meta.env.VITE_AUTH0_AUDIENCE,
   }}
   ```

   Then call the API with the token:

   ```js
   const { getAccessTokenSilently } = useAuth0()

   async function api(path, options = {}) {
     const token = await getAccessTokenSilently()
     const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
       ...options,
       headers: {
         'Content-Type': 'application/json',
         Authorization: `Bearer ${token}`,
         ...options.headers,
       },
     })
     if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
     return res.status === 204 ? null : res.json()
   }

   // api('/me'), api('/palaces'), api('/palaces', { method: 'POST', body: JSON.stringify(palace) })
   ```

   Users need to log out and back in once after the audience is added.
4. Set `DEV_AUTH=false` in `backend/.env` and test `/me` from the React app.
   To test in `/docs` instead: Auth0 → APIs → Loci API → **Test** tab gives a token; click
   **Authorize** in `/docs` and paste it.

How it works: the backend downloads Auth0's public keys and checks each token's signature,
issuer (our tenant), audience (this API) and expiry. The user's Auth0 ID (`sub`) links them to
their data. The backend never sees passwords.

## Switching to PostgreSQL (Neon)

SQLite (`loci.db`) is fine for local work. For the shared and deployed database:

1. Create a free project at neon.tech and copy the connection string.
2. Paste it as `DATABASE_URL` in `.env` (the code switches it to the `pg8000` driver and turns on SSL for you).
3. `alembic upgrade head` then `python -m app.seed`.

## Changing the schema

Never edit a migration that already ran on the shared database. Instead:

```powershell
# 1. edit app/models.py
alembic revision --autogenerate -m "add palace description"
# 2. read the new file in alembic/versions/ and check it
alembic upgrade head
```

## Deploying

Any Python host works. On Render: build command `pip install -r requirements.txt`, start command
`alembic upgrade head && python -m app.seed && uvicorn main:app --host 0.0.0.0 --port $PORT`.
Set `DATABASE_URL`, `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `CORS_ORIGINS` (the real frontend URL) and
**`DEV_AUTH=false`**. Check it with `GET /me` and no token: it must return 401.
