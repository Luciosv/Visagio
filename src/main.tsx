import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fuentes self-host (sin CDN, CLAUDE.md 6): variable, un solo archivo cada una.
import '@fontsource-variable/inter'
import '@fontsource-variable/oswald'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
