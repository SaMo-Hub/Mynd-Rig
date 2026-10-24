import { LIMBS } from '../rig/rigData'
import type { Pose } from './rigStore'

/**
 * Les **pistes** de la timeline, sur le modèle d'After Effects : un élément
 * (calque) regroupe des propriétés, et chaque propriété a ses propres
 * keyframes. Un bras peut donc partir avant une jambe, la rondeur s'animer
 * sans toucher à la position, etc.
 *
 * Une propriété **sans** keyframe n'est pas animée : elle garde la valeur posée
 * dans la pose courante (le chronomètre éteint d'After Effects). C'est ce qui
 * laisse la rondeur être un simple réglage tant qu'on ne l'anime pas.
 */
export type PropKind = 'body-pos' | 'body-rot' | 'gaze' | 'limb-pos' | 'limb-curve' | 'limb-bend'

export interface PropDef {
  /** `<élément>.<propriété>` — c'est l'identifiant écrit dans l'export. */
  id: string
  element: string
  kind: PropKind
  label: string
  /** Nombre de valeurs (x/y = 2). */
  size: 1 | 2
  /** Membre concerné, pour les propriétés de membre. */
  limb?: string
}

export interface ElementDef {
  id: string
  label: string
  props: PropDef[]
  /**
   * Ce qu'une keyframe « de pose » enregistre quand l'élément n'est pas encore
   * animé : sa position (et la rotation du corps), pas ses réglages de forme.
   */
  primary: PropDef[]
}

function prop(element: string, kind: PropKind, label: string, size: 1 | 2, limb?: string): PropDef {
  const suffix = kind.slice(kind.indexOf('-') + 1)
  return { id: `${element}.${kind === 'gaze' ? 'pos' : suffix}`, element, kind, label, size, limb }
}

const bodyPos = prop('body', 'body-pos', 'Position', 2)
const bodyRot = prop('body', 'body-rot', 'Rotation', 1)
const gazePos = prop('gaze', 'gaze', 'Position', 2)

export const ELEMENTS: ElementDef[] = [
  { id: 'body', label: 'Corps', props: [bodyPos, bodyRot], primary: [bodyPos, bodyRot] },
  { id: 'gaze', label: 'Regard', props: [gazePos], primary: [gazePos] },
  ...LIMBS.map((l) => {
    const pos = prop(l.key, 'limb-pos', 'Position', 2, l.key)
    return {
      id: l.key,
      label: l.label,
      props: [
        pos,
        prop(l.key, 'limb-curve', 'Rondeur', 1, l.key),
        prop(l.key, 'limb-bend', 'Rotation du pli', 1, l.key),
      ],
      primary: [pos],
    }
  }),
]

export const PROPS: PropDef[] = ELEMENTS.flatMap((e) => e.props)
export const PROP_BY_ID: Record<string, PropDef> = Object.fromEntries(PROPS.map((p) => [p.id, p]))
export const ELEMENT_BY_ID: Record<string, ElementDef> = Object.fromEntries(
  ELEMENTS.map((e) => [e.id, e]),
)
/** La « pose » au sens de l'ancien format : tout sauf la forme des membres. */
export const PRIMARY_PROPS: PropDef[] = ELEMENTS.flatMap((e) => e.primary)

/** Identifiants des propriétés de forme d'un membre. */
export const curveProp = (limb: string) => `${limb}.curve`
export const bendProp = (limb: string) => `${limb}.bend`
export const posProp = (limb: string) => `${limb}.pos`

export function readProp(p: Pose, d: PropDef, out: number[] | Float64Array): void {
  switch (d.kind) {
    case 'body-pos':
      out[0] = p.bodyX
      out[1] = p.bodyY
      break
    case 'body-rot':
      out[0] = p.bodyRot
      break
    case 'gaze':
      out[0] = p.gazeX
      out[1] = p.gazeY
      break
    case 'limb-pos': {
      const t = p.targets[d.limb!]
      out[0] = t.x
      out[1] = t.y
      break
    }
    case 'limb-curve':
      out[0] = p.shape[d.limb!].curve
      break
    case 'limb-bend':
      out[0] = p.shape[d.limb!].bendDeg
      break
  }
}

export function writeProp(p: Pose, d: PropDef, v: ArrayLike<number>): void {
  switch (d.kind) {
    case 'body-pos':
      p.bodyX = v[0]
      p.bodyY = v[1]
      break
    case 'body-rot':
      p.bodyRot = v[0]
      break
    case 'gaze':
      p.gazeX = v[0]
      p.gazeY = v[1]
      break
    case 'limb-pos':
      p.targets[d.limb!] = { x: v[0], y: v[1] }
      break
    case 'limb-curve':
      p.shape[d.limb!] = { ...p.shape[d.limb!], curve: v[0] }
      break
    case 'limb-bend':
      p.shape[d.limb!] = { ...p.shape[d.limb!], bendDeg: v[0] }
      break
  }
}

export function propValue(p: Pose, d: PropDef): number[] {
  const out = new Array<number>(d.size)
  readProp(p, d, out)
  return out
}
