import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward API calls and stored images to the FastAPI backend (backend/, port 8000); Gemini runs there.
    proxy: {
      '/api': 'http://localhost:8000',
      '/files': 'http://localhost:8000',
      '/cache': 'http://localhost:8000',
    },
  },
})
