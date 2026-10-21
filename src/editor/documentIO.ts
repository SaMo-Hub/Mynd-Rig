import { rigStore } from './rigStore'

/**
 * Le document hors de l'éditeur : export JSON, ouverture d'un export, et
 * sauvegarde automatique dans le navigateur.
 */

export function exportDocument(): void {
  const blob = new Blob([rigStore.toJSON()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'mynd-animation.json'
  a.click()
  URL.revokeObjectURL(url)
}

/** Émis quand un fichier ouvert n'est pas lisible (l'en-tête l'affiche). */
export const OPEN_FAILED_EVENT = 'mynd:open-failed'

/**
 * Ouvre un fichier exporté. Résout `null` si l'utilisateur annule, `true` /
 * `false` selon que le fichier a pu être lu. Un fichier refusé ne touche à rien.
 */
export function openDocument(): Promise<boolean | null> {
  return pickDocument().then((ok) => {
    if (ok === false) window.dispatchEvent(new Event(OPEN_FAILED_EVENT))
    return ok
  })
}

function pickDocument(): Promise<boolean | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      try {
        resolve(rigStore.loadJSON(await file.text()))
      } catch {
        resolve(false)
      }
    })
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

const AUTOSAVE_KEY = 'mynd-rig:document'
const AUTOSAVE_DELAY = 500

/**
 * Restaure le dernier document puis l'enregistre à chaque modification
 * (débattu). Un rechargement de page ne fait plus perdre l'animation.
 *
 * Tout accès au stockage est gardé : navigation privée, iframe tierce ou quota
 * plein le rendent indisponible, et l'éditeur doit fonctionner sans.
 */
export function startAutosave(): void {
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY)
    if (saved) rigStore.loadJSON(saved, { history: false })
  } catch {
    /* stockage indisponible : on démarre sur un document vide */
  }

  let timer = 0
  let last = ''
  rigStore.subscribe(() => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      const json = rigStore.toJSON()
      if (json === last) return
      last = json
      try {
        localStorage.setItem(AUTOSAVE_KEY, json)
      } catch {
        /* idem */
      }
    }, AUTOSAVE_DELAY)
  })
}
