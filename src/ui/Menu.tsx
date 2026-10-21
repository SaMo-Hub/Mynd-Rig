import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Popovers de l'éditeur : menu des animations, choix d'interpolation, menu
 * contextuel de la timeline, aide des raccourcis. Un seul comportement et un
 * seul dessin pour tous — carte `surface` arrondie, ombre `float`, sans trait.
 *
 * Entrée : `scale 0.95 → 1` + fondu en 150 ms `ease-out`, **depuis le
 * déclencheur** (`transform-origin` réglé par l'appelant). Pas de sortie
 * animée : un menu qu'on ferme a déjà servi, on ne le fait pas attendre.
 */

/**
 * État d'un popover : ouvert, « entré » (une frame plus tard, pour que la
 * transition CSS se joue), refermé au clic extérieur et à `Échap`.
 */
export function usePopover<T extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false)
  const [entered, setEntered] = useState(false)
  const rootRef = useRef<T>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Échap ferme le menu, et rien d'autre (pas de désélection derrière).
        e.stopImmediatePropagation()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown)
    // En capture : passer avant les raccourcis globaux de l'éditeur.
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      setEntered(false)
      return
    }
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [open])

  return { open, setOpen, entered, rootRef }
}

const ITEM_SELECTOR = '[role^="menuitem"]:not(:disabled)'

/**
 * La carte du menu. Navigation clavier du rôle `menu` : ↑ ↓, Début, Fin ; le
 * premier élément prend le focus à l'ouverture.
 */
export function MenuSurface({
  entered,
  label,
  className = '',
  style,
  children,
  menuRef,
}: {
  entered: boolean
  label: string
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
  menuRef?: React.Ref<HTMLDivElement>
}) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    ref.current?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus({ preventScroll: true })
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? [])]
    if (items.length === 0) return
    const i = items.indexOf(document.activeElement as HTMLElement)
    let next = -1
    if (e.key === 'ArrowDown') next = (i + 1) % items.length
    else if (e.key === 'ArrowUp') next = (i - 1 + items.length) % items.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = items.length - 1
    if (next < 0) return
    e.preventDefault()
    e.stopPropagation()
    items[next].focus()
  }

  return (
    <div
      ref={(el) => {
        ref.current = el
        if (typeof menuRef === 'function') menuRef(el)
        else if (menuRef) (menuRef as React.RefObject<HTMLDivElement | null>).current = el
      }}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={style}
      className={
        'z-40 rounded-xl bg-surface p-1.5 shadow-float ' +
        'transition duration-150 ease-out motion-reduce:transition-none ' +
        (entered ? 'scale-100 opacity-100 ' : 'scale-95 opacity-0 ') +
        className
      }
    >
      {children}
    </div>
  )
}

/**
 * Une ligne de menu. `checked` en fait un choix exclusif (`menuitemradio`) ;
 * `shortcut` affiche le raccourci clavier ; `tone="destructive"` pour ce qui
 * supprime — icône et libellé ensemble, jamais la couleur seule.
 */
export function MenuItem({
  icon: Icon,
  label,
  description,
  meta,
  shortcut,
  checked,
  tone = 'default',
  disabled = false,
  onSelect,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  description?: string
  /** Information courte à côté du libellé (durée d'un preset…). */
  meta?: string
  shortcut?: string
  checked?: boolean
  tone?: 'default' | 'destructive'
  disabled?: boolean
  onSelect: () => void
}) {
  const radio = checked !== undefined
  return (
    <button
      type="button"
      role={radio ? 'menuitemradio' : 'menuitem'}
      aria-checked={radio ? checked : undefined}
      disabled={disabled}
      onClick={onSelect}
      className={
        'flex min-h-11 w-full items-start gap-3 rounded-card px-3 py-2.5 text-left outline-none ' +
        'transition-colors duration-[120ms] ease-out motion-reduce:transition-none ' +
        (disabled
          ? 'cursor-not-allowed opacity-40 '
          : 'hover:bg-surface-elevated focus-visible:bg-surface-elevated ') +
        (checked ? 'bg-cyan-soft ' : '')
      }
    >
      {Icon && (
        <Icon
          className={
            'mt-0.5 h-5 w-5 shrink-0 ' + (tone === 'destructive' ? 'text-destructive' : 'text-action')
          }
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={
              'text-[15px] font-semibold ' +
              (tone === 'destructive' ? 'text-destructive' : 'text-text-primary')
            }
          >
            {label}
          </span>
          {meta && <span className="text-[12px] text-meta-ink">{meta}</span>}
        </span>
        {description && (
          <span className="mt-0.5 block text-[12px] leading-snug text-ink-soft">{description}</span>
        )}
      </span>
      {shortcut && (
        <kbd className="mt-0.5 shrink-0 font-sans text-[12px] font-semibold text-meta-ink">
          {shortcut}
        </kbd>
      )}
    </button>
  )
}

/** Sépare deux groupes d'un menu : un lavis, pas un trait. */
export function MenuSeparator() {
  return <div role="separator" className="mx-3 my-1 h-px bg-panel-row" />
}

/** Titre d'un groupe de menu. */
export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-2 text-[12px] font-semibold text-meta-ink">{children}</div>
  )
}
