/**
 * **Le** bouton de l'éditeur — port web de `MyndButton` (app iOS).
 * Même silhouette (pilule), mêmes variantes et mêmes cotes :
 *
 * - `primary`   : fond `action`, libellé `mist` — désactivé : `surfaceElevated` / `textDisabled`
 * - `secondary` : contour `border` 2 px, libellé `action`
 * - `ghost`     : sans fond, libellé `inkBlue`
 *
 * `regular` = pleine largeur (18 px semibold, 14/40 de padding) ;
 * `compact` = épouse le libellé (15 px semibold, 9/18) — le gabarit des barres
 * d'outils. Dans les deux cas la cible fait ≥ 44 px de haut.
 *
 * `active` rend l'état « en marche » d'un contrôle de barre (mode courant,
 * lecture, suivi du curseur) : il emprunte l'apparence `primary`, comme un
 * segment sélectionné sur iOS.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
export type ButtonSize = 'regular' | 'compact' | 'icon'
/**
 * Rendu de l'état plein (`primary` / `active`) :
 * - `action` : l'aplat cyan du CTA ;
 * - `destructive` : aplat rouge — l'enregistrement (auto-keyframe) ;
 * - `soft` : lavis `cyanSoft` — une **option** allumée (boucle, étirer), qui ne
 *   doit pas se lire comme une seconde action principale à côté de « Lire ».
 */
export type ButtonTone = 'action' | 'destructive' | 'soft'

const VARIANT_PRIMARY = 'bg-action text-mist'

const TONE_SOLID: Record<ButtonTone, string> = {
  action: `${VARIANT_PRIMARY} hover:brightness-110`,
  destructive: 'bg-destructive text-cream hover:brightness-110',
  soft: 'bg-cyan-soft text-action-ink hover:brightness-95',
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: VARIANT_PRIMARY,
  secondary: 'border-2 border-border text-action',
  ghost: 'text-ink-blue hover:bg-panel-row',
}

const VARIANT_DISABLED: Record<ButtonVariant, string> = {
  primary: 'bg-surface-elevated text-text-disabled',
  secondary: 'border-2 border-border/60 text-action/30',
  ghost: 'text-ink-blue/30',
}

const VARIANT_HOVER: Record<ButtonVariant, string> = {
  primary: 'hover:brightness-110',
  secondary: 'hover:bg-cyan-soft',
  ghost: 'hover:bg-panel-row',
}

const SIZE: Record<ButtonSize, string> = {
  regular: 'w-full px-10 py-3.5 text-[18px]',
  compact: 'px-[18px] py-[9px] text-[15px]',
  // Icône seule, dans une barre dense (la timeline) : cible carrée de 44 px.
  icon: 'h-11 w-11 shrink-0 p-0 text-[15px]',
}

export function Button({
  variant = 'secondary',
  size = 'compact',
  active = false,
  tone = 'action',
  disabled = false,
  className = '',
  children,
  ...rest
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  active?: boolean
  tone?: ButtonTone
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  // Un contrôle « en marche » se lit comme un CTA : même apparence que primary.
  const v: ButtonVariant = active ? 'primary' : variant

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active ? true : undefined}
      {...rest}
      className={
        'inline-flex min-h-11 select-none items-center justify-center gap-2 rounded-full ' +
        'font-semibold tracking-[-0.6px] whitespace-nowrap ' +
        // Appui : le léger enfoncement de `PressableStyle` (scale .98 / 120 ms).
        'transition duration-[120ms] ease-out motion-reduce:transition-none ' +
        (disabled ? 'cursor-not-allowed ' : 'active:scale-[0.98] ') +
        SIZE[size] + ' ' +
        (disabled
          ? VARIANT_DISABLED[v]
          : v === 'primary'
            ? TONE_SOLID[tone]
            : `${VARIANT[v]} ${VARIANT_HOVER[v]}`) + ' ' +
        className
      }
    >
      {children}
    </button>
  )
}
