import React from 'react'
import { createRoot } from 'react-dom/client'
import DemoOne from './components/ui/demo'
import './index.css'

// Isolated sandbox page (demo.html) for previewing new /components/ui
// pieces - separate module graph from main.jsx/App.jsx, so the dashboard
// itself is untouched.
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-border px-6 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">
          cld-flare-maxxing · component sandbox
        </p>
        <h1 className="text-lg font-semibold">bloim-animation-background</h1>
      </header>
      {/*
        The unicorn.studio scene behind this projectId renders in its own
        blue/violet palette - that's baked into the remote scene, not
        something the pasted component exposes as a prop. This filter is
        applied to the wrapper only (bloim-animation-background.tsx and
        demo.tsx stay byte-for-byte as given) to keep the sandbox on-brand
        with the app's Cloudflare orange.

        useWindowSize() inside the pasted component always sizes the scene
        to the FULL window (innerWidth/innerHeight), not the space left
        under this header, so the scene is taller than the area below it.
        flex + items-center + justify-center centers that oversized element
        on both axes, and overflow-hidden crops the excess evenly on every
        side, so the scene's own center lands on the visible area's center
        instead of drifting to the top and getting cropped only at the
        bottom.
      */}
      <div className="flex flex-1 items-center justify-center overflow-hidden">
        <div style={{ filter: 'sepia(1) saturate(6) hue-rotate(345deg) brightness(1.05)' }}>
          <DemoOne />
        </div>
      </div>
    </div>
  </React.StrictMode>
)
