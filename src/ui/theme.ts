/**
 * Accès aux tokens du DS depuis du code non-CSS (ici : la scène Pixi, qui a
 * besoin de couleurs numériques `0xRRGGBB`).
 *
 * Les valeurs ne sont **pas** redéclarées ici : elles sont lues sur
 * `:root` dans `index.css`, seule source de vérité. Conséquence utile : la
 * bascule clair/sombre traverse le canvas sans qu'on maintienne deux palettes.
 */

/** Nom d'un token tel que déclaré dans `index.css`, sans le préfixe `--mynd-`. */
export type TokenName =
  | 'background'
  | 'surface'
  | 'surface-elevated'
  | 'text-primary'
  | 'ink-soft'
  | 'slate'
  | 'border'
  | 'action'
  | 'action-ink'
  | 'cyan-soft'
  | 'ink-blue'
  | 'sky'
  | 'destructive'
  | 'neutral'
  | 'neutral-ink'
  | 'stage'
  | 'ink'
  | 'cream'
  | 'mist'
  | 'cyan'
  | 'card-border'
  | 'snap-guide'
  | 'resurface'
  | 'book-cover'
  | 'star'
  | 'lavender'
  | 'terracotta'
  | 'sage'

/** Valeur CSS brute du token (`#009dbc`, `rgb(…)`…). */
export function tokenCss(name: TokenName): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(`--mynd-${name}`)
    .trim()
}

/** Même token, converti en entier `0xRRGGBB` pour Pixi. */
export function tokenHex(name: TokenName): number {
  const raw = tokenCss(name)
  if (raw.startsWith('#')) {
    const h = raw.slice(1)
    // `#abc` → `#aabbcc`
    const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h
    return parseInt(full.slice(0, 6), 16)
  }
  const m = raw.match(/(\d+(?:\.\d+)?)/g)
  if (m && m.length >= 3) {
    const [r, g, b] = m.map((v) => Math.round(parseFloat(v)))
    return (r << 16) | (g << 8) | b
  }
  return 0x000000
}

/**
 * Prévient à chaque changement de thème (bascule manuelle via `data-theme` ou
 * réglage système). Renvoie la fonction de désabonnement.
 */
export function onThemeChange(cb: () => void): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const obs = new MutationObserver(cb)
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  mq.addEventListener('change', cb)
  return () => {
    obs.disconnect()
    mq.removeEventListener('change', cb)
  }
}
