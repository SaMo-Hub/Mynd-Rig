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

/* --- Timeline ---------------------------------------------------------------- */

export function IconSkipEnd(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M17 5v14" />
      <path d="M6 6.5v11l8-5.5-8-5.5Z" fill="currentColor" stroke="currentColor" />
    </Svg>
  )
}

/** Keyframe précédente : le losange, et la flèche qui y revient. */
export function IconKeyPrev(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 8.5 4.5 12 8 15.5 11.5 12 8 8.5Z" fill="currentColor" />
      <path d="M20 12h-5M17 9l-3 3 3 3" />
    </Svg>
  )
}

export function IconKeyNext(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M16 8.5 19.5 12 16 15.5 12.5 12 16 8.5Z" fill="currentColor" />
      <path d="M4 12h5M7 9l3 3-3 3" />
    </Svg>
  )
}

/** Lecture en boucle. */
export function IconLoop(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M17 3.5 20 6.5 17 9.5" />
      <path d="M4 11.5v-1a4 4 0 0 1 4-4h12" />
      <path d="M7 20.5 4 17.5 7 14.5" />
      <path d="M20 12.5v1a4 4 0 0 1-4 4H4" />
    </Svg>
  )
}

/** Auto-keyframe : le point d'enregistrement de tous les logiciels d'animation. */
export function IconRecord(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function IconTrash(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 6.5h15" />
      <path d="M9.5 6.5V4.5h5v2" />
      <path d="M6.5 6.5 7.5 20h9l1-13.5" />
      <path d="M10.5 10.5v6M13.5 10.5v6" />
    </Svg>
  )
}

export function IconCopy(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
      <path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
    </Svg>
  )
}

export function IconPaste(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 4.5h6v3H9z" />
      <path d="M15 5.5h1.5a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2H9" />
      <path d="M9.5 13.5h5M9.5 17h3" />
    </Svg>
  )
}

/** Dupliquer : deux losanges, le second qui part. */
export function IconDuplicate(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 7 13 12 8 17 3 12 8 7Z" />
      <path d="M16 7 21 12 16 17 11 12" />
    </Svg>
  )
}

/** Renverser dans le temps. */
export function IconReverse(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20 8H5M8 5 5 8l3 3" />
      <path d="M4 16h15M16 13l3 3-3 3" />
    </Svg>
  )
}

/** Insérer une keyframe : le losange et son « + ». */
export function IconKeyAdd(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10 5.5 16.5 12 10 18.5 3.5 12 10 5.5Z" />
      <path d="M19 3.5v5M16.5 6h5" />
    </Svg>
  )
}

export function IconSelectAll(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="3" strokeDasharray="2.5 3" />
      <path d="M12 9.5 14.5 12 12 14.5 9.5 12 12 9.5Z" fill="currentColor" />
    </Svg>
  )
}

export function IconUndo(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8.5 5 4.5 9l4 4" />
      <path d="M4.5 9h10a5 5 0 0 1 0 10h-3" />
    </Svg>
  )
}

export function IconRedo(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M15.5 5 19.5 9l-4 4" />
      <path d="M19.5 9h-10a5 5 0 0 0 0 10h3" />
    </Svg>
  )
}

export function IconZoomIn(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.5-4.5M10.5 8v5M8 10.5h5" />
    </Svg>
  )
}

export function IconZoomOut(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.5-4.5M8 10.5h5" />
    </Svg>
  )
}

/** Ouvrir un fichier. */
export function IconUpload(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4.5 17.5v1a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-1" />
    </Svg>
  )
}

export function IconKeyboard(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.5" y="6" width="19" height="12" rx="3" />
      <path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14h8" />
    </Svg>
  )
}

/** Étirer : les keyframes suivent la durée. */
export function IconStretch(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 12h17" />
      <path d="M6.5 9 3.5 12l3 3M17.5 9l3 3-3 3" />
      <path d="M12 8v8" />
    </Svg>
  )
}

/* --- Interpolations --------------------------------------------------------
   La courbe elle-même, de gauche à droite : c'est ce qui se lit le mieux. */

export function IconInterpSmooth(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 15.5c2.5-7 6-7 9-3.5s6.5 3.5 9-3.5" />
    </Svg>
  )
}

export function IconInterpLinear(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 18.5 20.5 5.5" />
    </Svg>
  )
}

export function IconInterpEase(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 18.5c7 0 10-13 17-13" />
    </Svg>
  )
}

export function IconInterpHold(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 18.5h8.5v-13h8.5" />
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
