/**
 * Jeu d'icônes de l'éditeur.
 *
 * Aucun emoji dans l'interface : un emoji ne prend pas la couleur du contexte
 * (donc ne suit ni le thème ni l'état d'un bouton), change de dessin d'un OS à
 * l'autre et n'a pas la même graisse que le reste. Ces tracés sont en
 * `currentColor`, à bouts **arrondis** — le même langage de forme que la police
 * arrondie de la marque et que les membres en capsule du personnage.
 *
 * Toutes les icônes font 24 × 24 et héritent de la taille via `className`
 * (défaut : 20 px, le gabarit des barres d'outils).
 */
type IconProps = { className?: string }

function Svg({ className = 'h-5 w-5', children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

export function IconPlay(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 5.5 18.5 12 8 18.5V5.5Z" fill="currentColor" stroke="currentColor" />
    </Svg>
  )
}

export function IconPause(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 5v14M15 5v14" />
    </Svg>
  )
}

export function IconSkipStart(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 5v14" />
      <path d="M18 6.5v11L10 12l8-5.5Z" fill="currentColor" stroke="currentColor" />
    </Svg>
  )
}

/** Keyframe : le losange de la timeline. */
export function IconKeyframe(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 4.5 19.5 12 12 19.5 4.5 12 12 4.5Z" fill="currentColor" stroke="currentColor" />
    </Svg>
  )
}

/** Réinitialiser : flèche qui revient sur ses pas. */
export function IconReset(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 5v5h5" />
      <path d="M4.5 10a8 8 0 1 1 .9 6.4" />
    </Svg>
  )
}

export function IconEye(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  )
}

export function IconDownload(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4.5 17.5v1a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-1" />
    </Svg>
  )
}

/** Animations préfaites : la baguette qui pose une pose toute faite. */
export function IconWand(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M14.5 5.5 5 15v4h4l9.5-9.5-4-4Z" />
      <path d="M13 7 17 11" />
      <path d="M18.5 3v3M21.5 4.5h-3" />
    </Svg>
  )
}

export function IconWarning(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 4.5 21 19.5H3L12 4.5Z" />
      <path d="M12 10v4M12 17h.01" />
    </Svg>
  )
}

export function IconSun(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </Svg>
  )
}

export function IconMoon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </Svg>
  )
}

/** Thème système : l'écran de la machine. */
export function IconMonitor(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M8.5 20.5h7M12 16.5v4" />
    </Svg>
  )
}

/** Mode Poser : la main qui déplace une extrémité. */
export function IconPose(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7.5v4" />
      <path d="M12 11.5 8 19M12 11.5l4 7.5" />
      <path d="M12 8.5 8.5 11" />
      <circle cx="16.5" cy="9.5" r="2.5" />
    </Svg>
  )
}

/** Mode Rigger : les points d'attache du squelette. */
export function IconRig(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="4.5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="19" r="2" />
      <path d="M11 6.2 7 17M13 6.2 17 17" />
    </Svg>
  )
}

/** Chevron — replier / déplier un panneau (pivoté par l'appelant). */
export function IconChevron(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9.5 5 16.5 12 9.5 19" />
    </Svg>
  )
}

/* --- Presets d'animation ---------------------------------------------------
   Une même famille de silhouettes — tête, buste, membres — dont seule la pose
   change : c'est la pose qui distingue les quatre cycles, exactement comme dans
   l'éditeur. Un picto abstrait (arcs, bulles) ne se lisait pas à 20 px. */

/** Repos : debout, membres le long du corps. */
export function IconIdle(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M12 7v5.5" />
      <path d="M12 8.5 10 13M12 8.5l2 4.5" />
      <path d="M12 12.5 11 20M12 12.5l1 7.5" />
    </Svg>
  )
}

/** Marche : l'enjambée, posée. */
export function IconWalk(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M12 7v5" />
      <path d="M12 8.5 8.5 11M12 8.5l3.5 2.5" />
      <path d="M12 12 7 19.5M12 12l5 7.5" />
    </Svg>
  )
}

/** Course : la même enjambée, ouverte et penchée, plus les traits de vitesse. */
export function IconRun(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="14" cy="4.5" r="2" />
      <path d="M13.6 7 12 12" />
      <path d="M13.2 8.5 16.5 10.5M13.2 8.5 10.5 10" />
      <path d="M12 12 8 19M12 12l5.5 6" />
      <path d="M2.5 9h3M2.5 13.5h4" />
    </Svg>
  )
}

/** Saut : membres ouverts en étoile, le corps en l'air. */
export function IconJump(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="6" r="2" />
      <path d="M12 8.5v4" />
      {/* Bras levés bien au-dessus de la tête, et le sol sous des pieds qui
          l'ont quitté : c'est ce qui distingue le saut des autres poses. */}
      <path d="M12 9.5 8.5 4M12 9.5l3.5-5.5" />
      <path d="M12 12.5 9.5 17M12 12.5l2.5 4.5" />
      <path d="M5.5 20.5h13" />
    </Svg>
  )
}

/** Table des icônes de preset, adressées par l'`icon` d'une `AnimationDef`. */
export const ANIMATION_ICONS = {
  idle: IconIdle,
  walk: IconWalk,
  run: IconRun,
  jump: IconJump,
} as const

export type AnimationIconName = keyof typeof ANIMATION_ICONS
