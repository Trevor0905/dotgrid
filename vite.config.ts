import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths let the app work on GitHub Pages project URLs.
  base: './',
  plugins: [react()],
})
