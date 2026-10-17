import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { Auth0Provider } from '@auth0/auth0-react'
import { currentMode } from './lib/mode.js'

// Two modes for now, sharing one login (see src/lib/mode.js):
//   studio   the NeverForgator 3D studio (src/App.jsx)
//   campus   Natasha's UF campus walk (src/palace/CampusApp.jsx)
// Each mode loads only its own code and styles.
const campus = currentMode() === 'campus'
const App = lazy(() => (campus ? import('./palace/CampusApp.jsx') : import('./App.jsx')))

const domain = import.meta.env.VITE_AUTH0_DOMAIN
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID
// The identifier of the Auth0 API (https://loci-api): access tokens are made for the FastAPI backend.
const audience = import.meta.env.VITE_AUTH0_AUDIENCE

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={null}>
      {domain && clientId ? (
        <Auth0Provider
          domain={domain}
          clientId={clientId}
          authorizationParams={{ redirect_uri: window.location.origin, ...(audience && { audience }) }}
        >
          <App />
        </Auth0Provider>
      ) : (
        // No .env.local: run the studio without login (the backend then needs DEV_AUTH=true).
        <App authDisabled />
      )}
    </Suspense>
  </StrictMode>,
)
