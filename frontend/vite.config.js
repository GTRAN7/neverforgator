import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The FastAPI backend. API_URL=... overrides it (e.g. a second backend with DEV_AUTH=true).
const API = process.env.API_URL || 'http://localhost:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward API calls and stored images to the FastAPI backend (backend/, port 8000); Gemini runs there.
    proxy: {
      '/api': API,
      '/files': API,
      '/cache': API,
    },
  },
})
