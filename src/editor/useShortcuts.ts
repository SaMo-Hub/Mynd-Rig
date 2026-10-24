import { useEffect } from 'react'
import { rigStore } from './rigStore'
import { exportDocument, openDocument } from './documentIO'

/**
 * Raccourcis clavier de l'éditeur, écoutés sur la fenêtre.
 *
 * Ils se taisent dans un champ de saisie (on y tape des chiffres, et ← →
 * y déplacent le curseur). Espace lit / met en pause même quand un bouton a
 * le focus — après un clic sur « Boucle », Espace doit lancer la lecture, pas
 * rebasculer la boucle ; seuls les cases à cocher et les menus le gardent.
 *
 * La table affichée dans l'aide (`SHORTCUTS`) et la logique vivent ici
 * ensemble, pour ne jamais diverger.
 */
export const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: 'Espace', label: 'Lire / pause' },
  { keys: '← →', label: 'Image précédente / suivante (⇧ : 10 images)' },
  { keys: '⇧← ⇧→', label: 'Keyframe précédente / suivante' },
  { keys: 'Début Fin', label: 'Aller au début / à la fin' },
  { keys: 'K', label: 'Keyframe sur ce qui a changé (sinon l’élément sélectionné)' },
  { keys: 'N', label: 'Activer / couper l’auto-keyframe' },
  { keys: '⌥← ⌥→', label: 'Décaler la sélection d’une image (⇧ : 10)' },
  { keys: '⌫', label: 'Supprimer la sélection' },
  { keys: 'mod+C  mod+V', label: 'Copier / coller au playhead' },
  { keys: 'mod+D', label: 'Dupliquer la sélection' },
  { keys: 'mod+A', label: 'Tout sélectionner' },
  { keys: 'Échap', label: 'Désélectionner' },
  { keys: 'mod+Z  ⇧mod+Z', label: 'Annuler / rétablir' },
  { keys: 'mod+S  mod+O', label: 'Sauvegarder / ouvrir' },
  { keys: 'Alt + glisser', label: 'Dupliquer des keyframes en les déplaçant' },
  { keys: '⇧ + clic', label: 'Ajouter à la sélection' },
  { keys: 'mod + molette', label: 'Zoomer la timeline' },
]

function isTextField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  return el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'range'].includes(el.type)
}

/** Éléments dont l'Espace est le geste propre : on le leur laisse. */
function ownsSpace(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) return true
  return el.closest('[role^="menuitem"]') !== null
}

export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTextField(e.target)) return
      const r = rigStore
      const mod = e.metaKey || e.ctrlKey
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
      let handled = true

      if (mod) {
        if (k === 'z') e.shiftKey ? r.redo() : r.undo()
        else if (k === 'y') r.redo()
        else if (k === 'c') r.copySelected()
        else if (k === 'v') r.paste()
        else if (k === 'd') r.duplicateSelected()
        else if (k === 'a') r.selectAllKeys()
        else if (k === 's') exportDocument()
        else if (k === 'o') void openDocument()
        else handled = false
      } else if (e.altKey && (k === 'ArrowLeft' || k === 'ArrowRight')) {
        r.nudgeSelected((k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1))
      } else {
        switch (k) {
          case ' ':
            // Un bouton focalisé ne doit pas aussi réagir à l'Espace.
            if (ownsSpace(e.target)) {
              handled = false
              break
            }
            r.togglePlay()
            break
          case 'ArrowLeft':
          case 'ArrowRight': {
            const dir = k === 'ArrowLeft' ? -1 : 1
            if (e.shiftKey) r.jumpToKeyframe(dir)
            else r.stepFrames(dir)
            break
          }
          case 'Home':
            r.goToStart()
            break
          case 'End':
            r.goToEnd()
            break
          case 'k':
          case 'i':
            r.addKeyframe()
            break
          case 'n':
            r.setAutoKey(!r.autoKey)
            break
          case 'Delete':
          case 'Backspace':
            r.deleteSelected()
            break
          case 'Escape':
            r.clearKeySelection()
            r.select(null)
            break
          default:
            handled = false
        }
      }
      if (handled) e.preventDefault()
    }
    // Un bouton s'active au relâchement de l'Espace : c'est là qu'il faut
    // l'en empêcher, puisque l'Espace a déjà servi à la lecture.
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== ' ' || isTextField(e.target) || ownsSpace(e.target)) return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])
}
