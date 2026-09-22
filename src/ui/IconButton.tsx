/**
 * Bouton rond — port des deux boutons ronds de l'accueil iOS :
 *
 * - `outline` : le bouton **recherche** de `HomeHeader` — capsule de verre
 *   cerclée d'un liseré **2 px `neutral`**, icône `textPrimary`. C'est le seul
 *   contour de la DA ; partout ailleurs les formes se détachent par la surface
 *   et l'ombre, jamais par un trait.
 * - `action` : le bouton flottant **« + »** de la Home — 60 px, verre teinté
 *   `action`, icône `cream`, ombre portée (0,14 / 10 / y4).
 *
 * Cible ≥ 44 px dans les deux cas. `label` est obligatoire : un bouton sans
 * texte visible doit toujours s'annoncer.
 */
export type IconButtonVariant = 'outline' | 'action'

export function IconButton({
  label,
  variant = 'outline',
  size = 44,
  active = false,
  className = '',
  children,
  ...rest
}: {
  label: string
  variant?: IconButtonVariant
  /** Diamètre en pixels — 44 par défaut, 60 pour le bouton flottant. */
  size?: number
  active?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const disabled = rest.disabled
  const look = disabled
    ? 'bg-surface-elevated text-text-disabled cursor-not-allowed'
    : variant === 'action'
      ? 'mynd-glass-action text-cream shadow-float'
      : active
        ? 'bg-cyan-soft text-action-ink ring-2 ring-action'
        : 'bg-surface text-text-primary ring-2 ring-neutral hover:bg-surface-elevated'

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active ? true : undefined}
      {...rest}
      className={
        'inline-grid shrink-0 place-items-center rounded-full ring-inset ' +
        'transition duration-[120ms] ease-out motion-reduce:transition-none ' +
        (disabled ? '' : 'active:scale-[0.94] ') +
        look +
        ' ' +
        className
      }
      style={{ width: size, height: size, ...rest.style }}
    >
      {children}
    </button>
  )
}
