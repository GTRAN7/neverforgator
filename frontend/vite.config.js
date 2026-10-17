import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward API calls and stored images to the backend (backend/, port 3001).
    proxy: {
      '/api': 'http://localhost:3001',
      '/files': 'http://localhost:3001',
      '/cache': 'http://localhost:3001',
    },
  },
})
