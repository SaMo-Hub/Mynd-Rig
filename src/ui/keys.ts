/**
 * Libellés de raccourcis : ⌘ sur Mac, Ctrl ailleurs. Un raccourci affiché qui
 * ne correspond pas au clavier de l'utilisateur est pire que pas de raccourci.
 */
export const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

/** `mod('Z')` → « ⌘Z » ou « Ctrl+Z ». */
export function mod(key: string): string {
  return IS_MAC ? `⌘${key}` : `Ctrl+${key}`
}
