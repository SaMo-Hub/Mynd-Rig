import { useEffect, useState } from 'react'
import { IconMonitor, IconMoon, IconSun } from './icons'
import { IconButton } from './IconButton'

/**
 * Bascule clair / sombre.
 *
 * L'app iOS **suit le réglage système** (aucun `preferredColorScheme`) : c'est
 * le défaut ici aussi (`theme = 'system'`, aucun attribut posé). Le forçage
 * existe parce que l'éditeur sert à juger le personnage : il faut pouvoir
 * vérifier la silhouette sur fond clair *et* sur fond sombre sans changer le
 * réglage de la machine.
 */
type Theme = 'system' | 'light' | 'dark'

const KEY = 'mynd-theme'

function apply(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(KEY) as Theme | null) ?? 'system',
  )

  useEffect(() => {
    apply(theme)
    localStorage.setItem(KEY, theme)
  }, [theme])

  // Cycle système → clair → sombre : trois états, un seul contrôle, pas de menu
  // pour un réglage qu'on change rarement.
  const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
  const Icon = { system: IconMonitor, light: IconSun, dark: IconMoon }[theme]
  const name: Record<Theme, string> = { system: 'Système', light: 'Clair', dark: 'Sombre' }

  return (
    <IconButton
      label={`Thème ${name[theme]}. Basculer en ${name[next[theme]].toLowerCase()}`}
      onClick={() => setTheme(next[theme])}
    >
      <Icon />
    </IconButton>
  )
}

/** Applique le thème mémorisé avant le premier rendu (évite le flash). */
export function initTheme() {
  apply((localStorage.getItem(KEY) as Theme | null) ?? 'system')
}
