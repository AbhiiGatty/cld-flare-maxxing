import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base './' lets the built dashboard be opened from any path (or `vite preview`).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5180, open: true },
  build: {
    rollupOptions: {
      // Two independent pages: the real dashboard (index.html) and an
      // isolated sandbox (demo.html) for previewing new /components/ui
      // pieces without touching the dashboard's own entry or App.jsx.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        demo: fileURLToPath(new URL('./demo.html', import.meta.url)),
      },
    },
  },
})
