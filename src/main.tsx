import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initTheme } from './ui/ThemeToggle'
import { startAutosave } from './editor/documentIO'

// Avant le premier rendu : pas de flash de thème au rechargement.
initTheme()
// Reprend l'animation laissée au dernier passage, puis la sauvegarde au fil de l'eau.
startAutosave()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
