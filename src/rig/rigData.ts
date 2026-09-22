/** Espace local du personnage = viewBox de mascot-final.svg. */
export const CHAR_W = 256
export const CHAR_H = 279
export const CHAR_CX = CHAR_W / 2
export const CHAR_CY = CHAR_H / 2

export const BODY_URL = '/assets/mascot-body.svg'
export const EYE_URL = '/assets/Oeil.svg'
export const PUPIL_URL = '/assets/pupil.svg'

/** Centres des yeux (coords locales personnage). */
export const EYES: { cx: number; cy: number }[] = [
  { cx: 104.055, cy: 54.5555 },
  { cx: 151.618, cy: 54.5555 },
]
/** Milieu entre les deux yeux (pour la poignée de regard). */
export const EYE_MID = {
  x: (EYES[0].cx + EYES[1].cx) / 2,
  y: (EYES[0].cy + EYES[1].cy) / 2,
}
/** Rayon du blanc de l'œil et de la pupille (unités locales). */
export const EYE_WHITE_R = 23.538
export const PUPIL_R = 19.661
/** Rayon intrinsèque de la pupille dans pupil.svg (pour l'échelle du sprite). */
export const PUPIL_SVG_R = 19.661
/** Déplacement max de la pupille (reste dans le blanc). */
export const GAZE_MAX = EYE_WHITE_R - PUPIL_R

/** Largeur (épaisseur) des membres, reprise des SVG d'origine. */
export const LIMB_WIDTH = 22.1532

export interface LimbDef {
  key: string
  label: string
  /** Point d'attache par défaut (épaule / hanche), coords locales personnage. */
  anchor: { x: number; y: number }
  /** Position de repos de l'extrémité (main / pied), coords locales. */
  restTarget: { x: number; y: number }
  /** Couleur de la capsule. */
  color: number
  /** Sens de pliage du genou/coude (+1 ou -1). */
  bend: 1 | -1
  /** Extrémité épinglée : reste fixe dans le monde quand le corps bouge. */
  pinned: boolean
}

/**
 * Membres à 2 segments (IK). Chaque membre plie à mi-longueur (genou/coude).
 * Rendu procédural (capsule à jointure arrondie) → couleur unie identique aux
 * SVG d'origine, mais capable de se plier.
 */
export const LIMBS: LimbDef[] = [
  {
    key: 'arm-left',
    label: 'Bras gauche',
    anchor: { x: 48.7069, y: 96.2199 },
    restTarget: { x: 11.0794, y: 205.8686 },
    color: 0x19c6dc,
    bend: -1,
    pinned: false,
  },
  {
    key: 'arm-right',
    label: 'Bras droit',
    anchor: { x: 207.146, y: 96.2199 },
    restTarget: { x: 244.773, y: 205.8686 },
    color: 0x19c6dc,
    bend: 1,
    pinned: false,
  },
  {
    key: 'leg-left',
    label: 'Jambe gauche',
    anchor: { x: 107.159, y: 146.074 },
    restTarget: { x: 107.159, y: 267.501 },
    color: 0x40dfff,
    bend: 1,
    pinned: true,
  },
  {
    key: 'leg-right',
    label: 'Jambe droite',
    anchor: { x: 147.033, y: 146.074 },
    restTarget: { x: 147.033, y: 267.501 },
    color: 0x40dfff,
    bend: -1,
    pinned: true,
  },
]

export const LIMB_BY_KEY: Record<string, LimbDef> = Object.fromEntries(
  LIMBS.map((l) => [l.key, l]),
)

/** Longueur totale du membre au repos (attache → extrémité). */
export function limbLength(l: LimbDef): number {
  return Math.hypot(l.restTarget.x - l.anchor.x, l.restTarget.y - l.anchor.y)
}

/** Longueur d'un segment (demi-membre) pour l'IK à 2 os. */
export function segLength(l: LimbDef): number {
  return limbLength(l) / 2
}
