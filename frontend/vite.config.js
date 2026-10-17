import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward API calls to the backend (backend/, port 3001); Gemini runs there.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
