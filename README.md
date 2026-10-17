# SwampHacks Project  
Make memorization easier with a AI assisted memory palace creation tool centered around UF campus.

### Project description
A memory palace maker built on the UF campus. Upload notes, a list or a topic, and AI pulls out the key concepts. Each concept is placed at a real campus location on an interactive map. A guided walkthrough helps you memorize the route, and a quiz helps the material stick. You can save your palaces and come back to them from a dashboard.

### Team:
Kira Luna Nichtawitz (UX Designer), Natasha Antoniuk (Frontend developer), Eric Tran (Gemini API Integration/middleware specialist), Thomas McLaughlin (Backend developer).

## How it works

1. **Sign in.** Accounts are handled by Auth0.
2. **Add material.** Paste notes, upload a file or a list, or just type a topic.
3. **Generate concepts.** Gemini pulls out the main concepts, puts them in order, and writes a vivid image that links each concept to its location.
4. **Build the palace.** Each concept goes to a stop on a fixed walking route around UF campus (for example Century Tower, then Marston Library, then the Reitz Union). The stops are shown on an interactive 2D map.
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
| Backend | Node + Express | API, Gemini calls, auth checks, database access |
| Database | PostgreSQL | Users, palaces, stops, quiz questions |
| Domain | GoDaddy | Production domain name |
| Hosting | Vercel | Running the frontend, backend and database |

### Architecture

```
React app ──(Auth0 access token)──▶ Express API ──▶ PostgreSQL
    │                                   │
    └──── Auth0 login ◀─────────────────┤ verifies tokens
                                        └──▶ Gemini API (server-side only)
```

- The Gemini API key lives only on the backend and is never sent to the browser.
- The backend checks each request's Auth0 token and links data to the user's Auth0 `sub` (their unique user ID).

### Draft data model

- `users`: `id`, `auth0_sub`, `email`, `created_at`
- `locations`: hand-picked campus landmarks: `id`, `name`, `lat`, `lng`, `route_order`, `description`
- `palaces`: `id`, `user_id`, `title`, `source_text`, `created_at`
- `palace_stops`: `palace_id`, `location_id`, `order`, `concept`, `association`
- `quiz_questions`: `palace_id`, `stop_id`, `question`, `answer`, `type`
- `quiz_attempts` (optional): `palace_id`, `user_id`, `score`, `taken_at`

## Roles

| Role | Owner | Responsibilities |
| --- | --- | --- |
| **Frontend** | Natasha | React pages and routing, interactive campus map, dashboard, connecting the UI to the API |
| **Design / UX** | Kira | Wireframes, visual style, walkthrough and quiz screens, campus location list and route, demo flow |
| **Backend & database** | Thomas | Express API, PostgreSQL schema and migrations, routes for saving/listing/opening palaces, hosting and deployment |
| **API integration & middleware** | Eric | Gemini prompts and structured JSON output, middleware that checks Auth0 tokens, input validation, rate limiting, error handling |

## Roadmap

1. **Setup:** repo, React app, Auth0 login ✅
2. **Design:** wireframes, pick 15–25 campus stops and a walking route, choose the map approach
3. **Backend skeleton:** Express server, Postgres schema, Auth0 token-checking middleware, `/me` endpoint
4. **AI pipeline:** Gemini prompt → structured JSON (concepts, associations, quiz) → saved as a palace
5. **Map + walkthrough:** show the palace's stops on the map and step through them in order
6. **Quiz:** questions in both directions, with scoring
7. **Dashboard:** list, open and delete saved palaces
8. **Deploy:** host the frontend and backend, point the GoDaddy domain at them, add the production URL in Auth0
9. **Polish + demo:** sample palaces, error and loading states, pitch

## Progress

- [x] React frontend scaffolded with Vite (`frontend/`)
- [x] Auth0 sign-in, sign-up and log-out working locally
- [x] Project idea / description
- [ ] Wireframes + campus route
- [ ] Backend + database
- [ ] Gemini integration
- [x] Palace view: illustrated campus stops, guided walkthrough, two-way quiz (frontend only, saved in the browser)
- [x] Dashboard (create / reopen / delete palaces, saved in the browser for now)
- [ ] Map
- [ ] Deployment + domain

## Project structure

```
swamphacks/
├── .mcp.json          # Auth0 MCP server config for Claude Code (optional)
└── frontend/                 # React + Vite app
    ├── .env.local            # Auth0 settings (not committed, see setup below)
    └── src/
        ├── main.jsx          # Wraps the app in Auth0Provider
        ├── App.jsx           # Sign-in landing page; shows the palace once signed in
        └── palace/
            ├── PalaceApp.jsx # Palace view: scenes, transitions, walkthrough, quiz
            ├── seed.js       # Sample route (stops, concepts, quiz cards)
            ├── storage.js    # Saves palaces + uploaded photos in the browser
            ├── palace.css    # All palace styles (colors are variables at the top)
            ├── assets/       # Campus cutout photos and the wayfinding sign
            └── components/   # Scene, Sign, Sky, quiz/walkthrough panels, menus
```

## Palace view (frontend)

Each stop on the route is a full-screen scene: a campus photo (cutouts with a transparent background stand on an illustrated sky) and a wayfinding sign with the place name on top and the subject below. Moving to the next stop zooms forward, and the next place rises up from the horizon.

- **Walk** runs the guided walkthrough. It visits the stops in order and shows each concept and its memory image.
- **Quiz** asks questions both ways. On the walk it asks "What did you put at Century Tower?", and at the end it asks "Where did you put photosynthesis?" with the scene hidden until you reveal the answer. Pinned cards can be included too.
- **Edit** lets you click a scene to pin extra question cards to spots in the photo. **Notes** edits the stop's subject, concept, memory image and photo.
- **Log in / Sign up** use Auth0. **Try it without an account** uses a guest library saved in this browser.
- **Dashboard** (first page after signing in): create a palace from the UF campus route (stops only) or the filled-in sample, or reopen / delete one of **your palaces**. First-time users only see the create card. "← All palaces" in the menu goes back.
- Pressing **→** on the last stop shows an end card with **Quiz me!** or **Continue** from the start.
- **Create** offers four starting points: the **UF campus route** (starts with the stadium and Smathers; pick each next UF place from **+ Add location** or the end-of-route card), the filled-in **Sample palace**, a **Custom route** (upload several photos; each becomes a stop, and you can rename and reorder them), or a **Blank palace** (one empty stop). Inside a palace, the menu's **+ Add photos as stops** adds a batch of photos at once.
- **Reset palace** (menu) puts the palace back the way it started; deleting a palace from the dashboard asks the same way. Both show a warning, and the red button only works after a countdown (5 seconds for reset, 3 for delete).
- **Dyslexia-friendly font:** the **Aa** button (next to the moon) switches all text to Comic Sans, or Comic Neue on devices without it. Remembered in this browser.
- **Night mode:** the moon/sun button (top right on every page) switches to a moonlit sky with stars and dark panels. It follows the computer's dark-mode setting until you click it.
- **Advanced: appearance** (menu) changes the sky (day, sunset, night, overcast or your own photo), hides clouds, birds, sun, hills or the castle, and changes the signs' color, side and size. Settings are saved with each palace.

- **+ Add location** (menu) asks for a name, description, optional subject and an optional photo. Without a photo the stop is plain hills; transparent PNGs stand on the sky like the campus cutouts.
- **Cards** can have a photo, shown with the question and in the quiz.
- **✨ Describe the subject / ✨ Define the term** fill the stop's Description and Definition with Gemini. They call `POST /api/describe` on the backend (port 3001, through the Vite `/api` proxy), which isn't built yet. Expected contract: request `{ kind: 'subject' | 'term', text, subject?, place? }`, response `{ description }` (2–3 plain sentences). Without the backend the buttons show a "backend not running" message.

The sample route lives in `src/palace/seed.js`. Its fields follow the draft data model: each location holds `concept` and `association` (`palace_stops`), and `pins` are extra `quiz_questions`. Until the backend is ready, palaces are saved in the browser: a library per Auth0 user (or the guest) in `localStorage`, and uploaded photos in IndexedDB. `src/palace/storage.js` is the only place that reads or writes them, so it can be swapped for API calls. Export / Import in the menu moves a palace between browsers.

## Setting up on a new device

**Requirements:** [Node.js](https://nodejs.org/) 20.19+ or 22.12+ (we use Node 22) and npm.

1. Clone the repo and install dependencies:

   ```bash
   git clone <repo-url>
   cd swamphacks/frontend
   npm install
   ```

2. Create `frontend/.env.local` with the Auth0 settings. This file is gitignored, so each device needs its own copy:

   ```
   VITE_AUTH0_DOMAIN=dev-sknccm5343cwp4hh.us.auth0.com
   VITE_AUTH0_CLIENT_ID=LIZYqIyjABCSklIoqaGpdMTtvTEIV7O1
   ```

   These two values aren't secrets. A browser app has to ship them to every visitor anyway. You can also find them in the Auth0 dashboard under **Applications → SwampHacks Project → Settings**.

3. Start the dev server:

   ```bash
   npm run dev
   ```

   Then open http://localhost:5173.

## Auth0 integration

### How it works

- The app uses the official [Auth0 React SDK](https://github.com/auth0/auth0-react) (`@auth0/auth0-react`).
- `src/main.jsx` wraps the app in `<Auth0Provider>`, which reads the domain and client ID from `.env.local`. Vite only exposes variables that start with `VITE_` to the browser.
- Components call the `useAuth0()` hook to get `isAuthenticated`, `user`, `isLoading`, `loginWithRedirect()` and `logout()`. See `src/App.jsx` for an example.
- **Log in** and **Sign up** redirect to Auth0's hosted login page. Sign up passes `screen_hint: 'signup'` so the page opens on the sign-up form. After you sign in, Auth0 redirects back to the app and the SDK keeps the session.
- The Auth0 application is a **Single Page Application**, so it doesn't use a client secret.

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
