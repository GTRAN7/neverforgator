# SwampHacks Project

> Project description coming soon.

### Team:
Kira Luna Nichtawitz, Natasha Antoniuk, Eric Tran, Thomas McLaughlin

## Progress

- [x] React frontend scaffolded with Vite (`frontend/`)
- [x] Auth0 sign-in, sign-up and log-out working locally
- [ ] Project idea / description
- [ ] Backend
- [ ] Deployment

## Project structure

```
swamphacks/
├── .mcp.json          # Auth0 MCP server config for Claude Code (optional)
└── frontend/          # React + Vite app
    ├── .env.local     # Auth0 settings (not committed, see setup below)
    └── src/
        ├── main.jsx   # Wraps the app in Auth0Provider
        └── App.jsx    # Sign-in page / signed-in view
```

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
