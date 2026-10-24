import { CHAR_CX, CHAR_CY, GAZE_MAX, LIMBS, LIMB_BY_KEY, limbLength } from '../rig/rigData'
import type { AnimationDef, DepthSort, LimbStyle } from '../rig/animations'
import {
  ELEMENT_BY_ID,
  PRIMARY_PROPS,
  PROPS,
  PROP_BY_ID,
  bendProp,
  curveProp,
  posProp,
  propValue,
  writeProp,
  type PropDef,
} from './tracks'

export type Mode = 'pose' | 'rig'

export interface Vec {
  x: number
  y: number
}

/** Forme d'un membre : animable, comme la position (voir `tracks.ts`). */
export interface LimbShape {
  curve: number
  bendDeg: number
}

/**
 * Une pose = l'état de toutes les propriétés animables à un instant. Les
 * keyframes n'en stockent qu'une propriété chacune ; les propriétés non
 * animées gardent ici leur valeur fixe.
 */
export interface Pose {
  /** cible d'extrémité (main / pied) de chaque membre, coords locales. */
  targets: Record<string, Vec>
  /** rondeur et rotation du pli de chaque membre. */
  shape: Record<string, LimbShape>
  bodyX: number
  bodyY: number
  bodyRot: number
  /** décalage du regard (pupilles), coords locales, partagé par les 2 yeux. */
  gazeX: number
  gazeY: number
}

/**
 * Interpolation du segment qui **part** d'une keyframe (jusqu'à la suivante).
 *
 * - `smooth` : courbe qui passe par les keyframes sans s'y arrêter (tangentes
 *   de Catmull-Rom bridées, donc sans dépassement : un dépassement ferait sortir
 *   une extrémité de sa portée, que `solveIK` clamperait en silence). Défaut
 *   des keyframes posées à la main.
 * - `linear` : vitesse constante. Défaut des presets, dont la fluidité vient de
 *   la densité d'échantillonnage.
 * - `ease` : ralenti à l'arrivée et au départ de chaque keyframe.
 * - `hold` : la valeur tient jusqu'à la keyframe suivante, puis saute.
 */
export type Interp = 'smooth' | 'linear' | 'ease' | 'hold'
export const INTERPS: readonly Interp[] = ['smooth', 'linear', 'ease', 'hold']

/** Keyframe d'**une** propriété (`prop`, cf. `tracks.ts`). */
export interface Keyframe {
  id: number
  prop: string
  time: number
  /** valeurs de la propriété (x/y pour une position, un nombre sinon). */
  v: number[]
  interp: Interp
}

/** État d'une propriété au playhead, pour le bouton keyframe du panneau. */
export type KeyState = 'key' | 'animated' | 'static'

export type Anchors = Record<string, Vec>

/**
 * Cadence de la timeline : la grille sur laquelle se posent keyframes et
 * playhead quand on les manipule. La lecture, elle, reste continue.
 */
export const FPS = 24
const FRAME = 1 / FPS
/** Deux keyframes à moins d'une demi-image sont la même keyframe. */
const HALF_FRAME = FRAME / 2
export const snapToFrame = (t: number): number => Math.round(t * FPS) / FPS

const MIN_DURATION = 0.5
const HISTORY_LIMIT = 200
/** Fenêtre de fusion des gestes répétés (curseur, flèches) en un seul pas d'annulation. */
const COALESCE_MS = 700
const DEG = Math.PI / 180
const TAU = Math.PI * 2

/** Position des extrémités épinglées : elle bouge quand le corps bouge. */
const PINNED_POS = LIMBS.filter((l) => l.pinned).map((l) => posProp(l.key))

export const DEFAULT_SHAPE: LimbShape = { curve: 1, bendDeg: 0 }

export function emptyPose(): Pose {
  const targets: Record<string, Vec> = {}
  const shape: Record<string, LimbShape> = {}
  for (const l of LIMBS) {
    targets[l.key] = { ...l.restTarget }
    shape[l.key] = { ...DEFAULT_SHAPE }
  }
  return { targets, shape, bodyX: 0, bodyY: 0, bodyRot: 0, gazeX: 0, gazeY: 0 }
}

export function clonePose(p: Pose): Pose {
  const targets: Record<string, Vec> = {}
  for (const k in p.targets) targets[k] = { ...p.targets[k] }
  const shape: Record<string, LimbShape> = {}
  for (const k in p.shape) shape[k] = { ...p.shape[k] }
  return {
    targets,
    shape,
    bodyX: p.bodyX,
    bodyY: p.bodyY,
    bodyRot: p.bodyRot,
    gazeX: p.gazeX,
    gazeY: p.gazeY,
  }
}

function cloneKey(k: Keyframe): Keyframe {
  return { id: k.id, prop: k.prop, time: k.time, v: [...k.v], interp: k.interp }
}

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f
}

function easeInOut(f: number): number {
  return f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2
}

/** Ramène un angle dans ]-π, π]. */
function wrapPi(a: number): number {
  return a - TAU * Math.round(a / TAU)
}

/**
 * Tangente d'une keyframe pour l'interpolation lisse : Catmull-Rom à pas
 * variable, annulée aux extrêmes et bridée à 3× la pente voisine
 * (Fritsch-Carlson) — la courbe ne dépasse donc pas ses keyframes.
 */
function tangent(prev: number, cur: number, next: number, tp: number, tc: number, tn: number) {
  const d0 = (cur - prev) / (tc - tp || 1)
  const d1 = (next - cur) / (tn - tc || 1)
  if (d0 * d1 <= 0) return 0
  const m = (next - prev) / (tn - tp || 1)
  const lim = 3 * Math.min(Math.abs(d0), Math.abs(d1))
  return Math.sign(m) * Math.min(Math.abs(m), lim)
}

/** Ce que l'annulation restaure : le document, plus la sélection et le temps. */
interface Snapshot {
  keyframes: Keyframe[]
  duration: number
  loop: boolean
  pose: Pose
  anchors: Anchors
  stretch: Record<string, boolean>
  styleLinked: boolean
  depthSort: DepthSort | 'none'
  keySelection: number[]
  currentTime: number
}

interface ClipKey {
  /** temps relatif à la première keyframe copiée. */
  dt: number
  prop: string
  v: number[]
  interp: Interp
}

/** Piste à faire tourner dans la boucle (voir `wrapPlan`). */
interface WrapTrack {
  prop: string
  /** keyframes d'origine, figées au début du geste. */
  keys: Keyframe[]
  /** id réservé à la keyframe de début qu'ajoute la rotation. */
  startId: number
}

/** Une pose datée, telle que la produisent les presets et l'ancien format. */
interface PoseFrame {
  time: number
  interp: Interp
  pose: Pose
}

/**
 * Store d'état de l'éditeur. Pixi lit `pose` / `anchors` en direct chaque frame
 * (drag et lecture fluides). React ne s'abonne qu'aux changements structurels.
 *
 * Épinglage : les extrémités `pinned` (les pieds) restent fixes dans le monde
 * quand le corps bouge. Comme les cibles sont stockées en coords locales, on
 * compense la cible à chaque déplacement / rotation du corps — la position des
 * pieds compte donc parmi les propriétés modifiées par ce geste.
 *
 * Historique : chaque geste qui modifie le document pose un `checkpoint()`
 * **avant** de le modifier. Un glissé sur la scène = un seul pas (préparé au
 * `beginGesture`, versé au premier changement) ; les réglages continus
 * (curseurs, flèches) sont fusionnés.
 */
class RigStore {
  mode: Mode = 'pose'
  /** Élément sélectionné (`body`, `gaze` ou la clé d'un membre). */
  selected: string | null = null
  /** échelle de rendu, écrite par le canvas (nécessaire à la compensation). */
  viewScale = 1

  anchors: Anchors = Object.fromEntries(LIMBS.map((l) => [l.key, { ...l.anchor }]))
  pose: Pose = emptyPose()

  /** Étirement autorisé, par membre (config, non animée). */
  stretch: Record<string, boolean> = Object.fromEntries(LIMBS.map((l) => [l.key, false]))
  /** Curseurs liés : un réglage s'applique aux 4 membres. */
  styleLinked = true
  /** Les pupilles suivent le curseur de la souris. */
  followGaze = false
  /**
   * Membres triés par profondeur : dans chaque paire concernée, le plus en
   * avant passe devant le corps, l'autre est assombri derrière. Réglé par les
   * presets d'animation ; sans lui, deux membres superposés sont illisibles.
   * `'legs'` = jambes seules (marche), `'all'` = jambes et bras (course).
   */
  depthSort: DepthSort | 'none' = 'none'

  /** Toutes les keyframes, toutes propriétés confondues, triées par temps. */
  keyframes: Keyframe[] = []
  duration = 4
  currentTime = 0
  playing = false
  loop = true

  /**
   * Auto-keyframe : toute modification d'une propriété s'enregistre à
   * l'instant du playhead (crée la keyframe ou met à jour celle qui s'y trouve).
   */
  autoKey = false
  /** Keyframes sélectionnées dans la timeline (ids). */
  keySelection = new Set<number>()
  /**
   * Une propriété **animée** a été modifiée sans être enregistrée : le
   * prochain déplacement du playhead la perdra. Toujours faux en auto-keyframe.
   * (Une propriété non animée, elle, garde sa nouvelle valeur.)
   */
  poseDirty = false
  /** Keyframes copiées, en temps relatif. */
  clipboard: ClipKey[] | null = null

  private version = 0
  private nextId = 1
  private listeners = new Set<() => void>()
  private undoStack: Snapshot[] = []
  private redoStack: Snapshot[] = []
  private lastTag = ''
  private lastAt = 0
  /**
   * État mémorisé au début d'un glissé sur la scène, versé dans l'historique
   * seulement au premier vrai changement : un clic sur une poignée sans la
   * bouger ne doit pas créer un pas d'annulation vide.
   */
  private pendingCheckpoint: Snapshot | null = null
  /** Temps d'origine des keyframes pendant un glissé dans la timeline. */
  private dragOrigin: Map<number, number> | null = null
  /** Glissé en boucle en cours (voir `wrapPlan`). */
  private wrapDrag: WrapTrack[] | null = null
  /** Décalage en boucle au clavier en cours, cumulé sur une rafale. */
  private nudgeWrap: { plan: WrapTrack[]; delta: number; ids: Set<number> } | null = null
  /**
   * Propriétés modifiées depuis le dernier déplacement du playhead : c'est ce
   * qu'enregistre la touche K.
   */
  private edited = new Set<string>()

  // Buffers de l'interpolation (une propriété a au plus 2 valeurs).
  private chP = new Float64Array(2)
  private chA = new Float64Array(2)
  private chB = new Float64Array(2)
  private chN = new Float64Array(2)
  private chOut = new Float64Array(2)
  /** Keyframes regroupées par propriété, recalculées à chaque échantillonnage. */
  private groups: Record<string, Keyframe[]> = Object.fromEntries(PROPS.map((d) => [d.id, []]))

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getSnapshot = (): number => this.version
  private emit(): void {
    this.version++
    this.listeners.forEach((l) => l())
  }

  // --- Historique ---
  get canUndo(): boolean {
    return this.undoStack.length > 0
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /**
   * Mémorise l'état **avant** une modification. Deux appels de même `tag`
   * rapprochés (un curseur qu'on fait glisser, une flèche maintenue) ne
   * forment qu'un seul pas d'annulation.
   */
  checkpoint(tag = ''): void {
    const now = performance.now()
    if (tag && tag === this.lastTag && now - this.lastAt < COALESCE_MS) {
      this.lastAt = now
      return
    }
    this.lastTag = tag
    this.lastAt = now
    this.pushUndo(this.snapshot())
  }
  private pushUndo(s: Snapshot): void {
    this.pendingCheckpoint = null
    this.undoStack.push(s)
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift()
    this.redoStack.length = 0
  }
  private commitPending(): void {
    if (this.pendingCheckpoint) this.pushUndo(this.pendingCheckpoint)
  }

  undo(): void {
    const s = this.undoStack.pop()
    if (!s) return
    this.redoStack.push(this.snapshot())
    this.restore(s)
  }
  redo(): void {
    const s = this.redoStack.pop()
    if (!s) return
    this.undoStack.push(this.snapshot())
    this.restore(s)
  }

  private snapshot(): Snapshot {
    const anchors: Anchors = {}
    for (const k in this.anchors) anchors[k] = { ...this.anchors[k] }
    return {
      keyframes: this.keyframes.map(cloneKey),
      duration: this.duration,
      loop: this.loop,
      pose: clonePose(this.pose),
      anchors,
      stretch: { ...this.stretch },
      styleLinked: this.styleLinked,
      depthSort: this.depthSort,
      keySelection: [...this.keySelection],
      currentTime: this.currentTime,
    }
  }

  private restore(s: Snapshot): void {
    this.keyframes = s.keyframes
    this.duration = s.duration
    this.loop = s.loop
    this.pose = s.pose
    this.anchors = s.anchors
    this.stretch = s.stretch
    this.styleLinked = s.styleLinked
    this.depthSort = s.depthSort
    this.keySelection = new Set(s.keySelection)
    this.currentTime = s.currentTime
    this.playing = false
    this.poseDirty = false
    this.edited.clear()
    this.dragOrigin = null
    this.wrapDrag = null
    this.pendingCheckpoint = null
    // Le geste suivant ouvre un nouveau pas, même s'il porte le même tag.
    this.lastTag = ''
    this.emit()
  }

  // --- Interaction ---
  setMode(m: Mode): void {
    this.mode = m
    this.emit()
  }
  select(k: string | null): void {
    if (this.selected === k) return
    this.selected = k
    this.emit()
  }

  /**
   * Début d'un glissé sur la scène : un pas d'annulation pour tout le geste,
   * et la lecture s'arrête (sinon elle écraserait la pose sous le doigt).
   * `animated` = le geste modifie la pose (et pas les points d'attache).
   */
  beginGesture(animated: boolean): void {
    this.pendingCheckpoint = this.snapshot()
    this.lastTag = ''
    this.playing = false
    if (animated && this.autoKey) {
      // La keyframe s'écrira sur la grille : on y aligne d'abord le playhead,
      // pour que la pose qu'on modifie soit bien celle de cet instant.
      this.currentTime = snapToFrame(this.currentTime)
      if (!this.poseDirty) this.sampleInto(this.pose, this.currentTime)
    }
    this.emit()
  }

  /**
   * Après toute modification de propriétés : auto-keyframe, ou pose « non
   * enregistrée » si l'une d'elles est animée.
   */
  private poseEdited(props: readonly string[]): void {
    this.commitPending()
    for (const p of props) this.edited.add(p)
    if (this.autoKey) {
      const ids = props.map((p) => this.upsertKey(p, this.currentTime).id)
      if (this.keySelection.size !== ids.length || !ids.every((id) => this.keySelection.has(id))) {
        this.keySelection = new Set(ids)
      }
      for (const p of props) this.edited.delete(p)
      this.poseDirty = false
    } else {
      this.updateDirty()
    }
  }
  private updateDirty(): void {
    this.poseDirty = !this.autoKey && [...this.edited].some((p) => this.isAnimated(p))
  }

  setTarget(key: string, x: number, y: number): void {
    this.pose.targets[key] = { x, y }
    this.poseEdited([posProp(key)])
    this.emit()
  }
  setAnchor(key: string, x: number, y: number): void {
    this.commitPending()
    this.anchors[key] = { x, y }
    this.emit()
  }
  /** Déplace le regard (borné au blanc de l'œil). */
  setGaze(x: number, y: number): void {
    this.applyGaze(x, y)
    this.poseEdited(['gaze.pos'])
    this.emit()
  }
  /**
   * Regard qui suit le curseur : ce n'est pas une édition — ni keyframe, ni
   * pose « non enregistrée », sinon le moindre survol remplirait la timeline.
   */
  followGazeTo(x: number, y: number): void {
    this.applyGaze(x, y)
    this.emit()
  }
  private applyGaze(x: number, y: number): void {
    const d = Math.hypot(x, y)
    if (d > GAZE_MAX && d > 0) {
      x = (x / d) * GAZE_MAX
      y = (y / d) * GAZE_MAX
    }
    this.pose.gazeX = x
    this.pose.gazeY = y
  }
  setFollowGaze(v: boolean): void {
    this.followGaze = v
    this.emit()
  }
  /** Remet la pose au repos ; la forme des membres (un réglage) est gardée. */
  resetPose(): void {
    this.checkpoint()
    this.playing = false
    const shape = this.pose.shape
    this.pose = emptyPose()
    this.pose.shape = shape
    this.poseEdited(PRIMARY_PROPS.map((d) => d.id))
    this.emit()
  }

  // --- Rotation (panneau) ---
  /** Angle d'un membre autour de son attache, en degrés (0° = vers le bas). */
  limbAngle(key: string): number {
    const a = this.anchors[key]
    const t = this.pose.targets[key]
    return Math.atan2(t.x - a.x, t.y - a.y) / DEG
  }
  /** Tourne un membre autour de son attache, sans changer son extension. */
  setLimbAngle(key: string, deg: number): void {
    this.checkpoint(`angle:${key}`)
    this.playing = false
    const a = this.anchors[key]
    const t = this.pose.targets[key]
    let d = Math.hypot(t.x - a.x, t.y - a.y)
    if (d < 1) d = limbLength(LIMB_BY_KEY[key])
    const r = deg * DEG
    this.pose.targets[key] = { x: a.x + Math.sin(r) * d, y: a.y + Math.cos(r) * d }
    this.poseEdited([posProp(key)])
    this.emit()
  }
  setBodyRotDeg(deg: number): void {
    this.checkpoint('body-rot')
    this.playing = false
    this.setBodyRot(deg * DEG)
  }

  // --- Forme des membres ---
  setStyleLinked(v: boolean): void {
    this.checkpoint()
    this.styleLinked = v
    this.emit()
  }
  /** Applique un réglage aux membres donnés ; renvoie les propriétés modifiées. */
  private applyStyle(keys: readonly string[], partial: Partial<LimbStyle>): string[] {
    const props: string[] = []
    for (const key of keys) {
      if (partial.stretch !== undefined) this.stretch[key] = partial.stretch
      const sh = this.pose.shape[key]
      if (partial.curve !== undefined) {
        this.pose.shape[key] = { ...sh, curve: partial.curve }
        props.push(curveProp(key))
      }
      if (partial.bendDeg !== undefined) {
        this.pose.shape[key] = { ...this.pose.shape[key], bendDeg: partial.bendDeg }
        props.push(bendProp(key))
      }
    }
    return props
  }
  setLimbStyle(key: string, partial: Partial<LimbStyle>): void {
    this.checkpoint(`style:${key}`)
    this.playing = false
    const props = this.applyStyle([key], partial)
    // Un réglage propre à un membre délie les quatre : en mode lié ils ont
    // tous la même valeur, donc rien n'est perdu.
    this.styleLinked = false
    if (props.length) this.poseEdited(props)
    this.emit()
  }
  /** Recopie le style d'un membre sur les quatre et les relie. */
  applyStyleToAll(key: string): void {
    this.checkpoint()
    this.playing = false
    const props = this.applyStyle(
      LIMBS.map((l) => l.key),
      { ...this.pose.shape[key], stretch: this.stretch[key] },
    )
    this.styleLinked = true
    this.poseEdited(props)
    this.emit()
  }
  setAllStyle(partial: Partial<LimbStyle>): void {
    this.checkpoint('style:all')
    this.playing = false
    const props = this.applyStyle(
      LIMBS.map((l) => l.key),
      partial,
    )
    if (props.length) this.poseEdited(props)
    this.emit()
  }

  /** Déplace le corps ; les extrémités épinglées restent fixes dans le monde. */
  nudgeBody(dScreenX: number, dScreenY: number): void {
    this.pose.bodyX += dScreenX
    this.pose.bodyY += dScreenY
    const s = this.viewScale || 1
    const c = Math.cos(-this.pose.bodyRot)
    const sin = Math.sin(-this.pose.bodyRot)
    const ldx = (dScreenX * c - dScreenY * sin) / s
    const ldy = (dScreenX * sin + dScreenY * c) / s
    for (const l of LIMBS) {
      if (!l.pinned) continue
      const t = this.pose.targets[l.key]
      this.pose.targets[l.key] = { x: t.x - ldx, y: t.y - ldy }
    }
    this.poseEdited(['body.pos', ...PINNED_POS])
    this.emit()
  }

  /** Tourne le corps ; les extrémités épinglées restent fixes dans le monde. */
  setBodyRot(newRot: number): void {
    const dRot = this.pose.bodyRot - newRot
    const c = Math.cos(dRot)
    const s = Math.sin(dRot)
    for (const l of LIMBS) {
      if (!l.pinned) continue
      const t = this.pose.targets[l.key]
      const px = t.x - CHAR_CX
      const py = t.y - CHAR_CY
      this.pose.targets[l.key] = { x: CHAR_CX + px * c - py * s, y: CHAR_CY + px * s + py * c }
    }
    this.pose.bodyRot = newRot
    this.poseEdited(['body.rot', ...PINNED_POS])
    this.emit()
  }

  // --- Temps et lecture ---
  get lastKeyTime(): number {
    return this.keyframes.length ? this.keyframes[this.keyframes.length - 1].time : 0
  }

  /**
   * Change la durée. `stretch` : les keyframes suivent, à la même proportion
   * (accélérer ou ralentir tout un cycle). Sinon la durée ne peut pas passer
   * sous la dernière keyframe — on ne coupe pas l'animation en silence.
   */
  setDuration(d: number, stretch = false): void {
    if (!Number.isFinite(d)) return
    d = Math.max(MIN_DURATION, d)
    const scale = stretch && this.keyframes.length > 0
    if (!scale) d = Math.max(d, this.lastKeyTime)
    if (d === this.duration) return
    this.checkpoint('duration')
    if (scale) {
      const f = d / this.duration
      for (const k of this.keyframes) k.time *= f
      this.currentTime *= f
    }
    this.duration = d
    this.currentTime = Math.min(this.currentTime, d)
    this.refresh()
    this.emit()
  }
  setLoop(v: boolean): void {
    this.checkpoint()
    this.loop = v
    this.emit()
  }
  setAutoKey(v: boolean): void {
    this.autoKey = v
    this.emit()
  }

  setTime(t: number): void {
    this.currentTime = Math.max(0, Math.min(this.duration, t))
    this.sampleInto(this.pose, this.currentTime)
    this.poseDirty = false
    this.edited.clear()
    this.emit()
  }
  /** Avance / recule d'un nombre d'images, sur la grille. */
  stepFrames(n: number): void {
    this.playing = false
    let t = snapToFrame(this.currentTime) + n * FRAME
    if (this.loop && this.duration > 0) {
      if (t > this.duration + 1e-6) t = 0
      else if (t < -1e-6) t = snapToFrame(this.duration)
    }
    this.setTime(t)
  }
  goToStart(): void {
    this.playing = false
    this.setTime(0)
  }
  goToEnd(): void {
    this.playing = false
    this.setTime(this.duration)
  }
  play(): void {
    if (this.keyframes.length < 2) return
    // Relancer depuis la fin d'une animation one-shot : on repart du début.
    if (!this.loop && this.currentTime >= this.duration - 1e-6) this.currentTime = 0
    this.playing = true
    this.poseDirty = false
    this.edited.clear()
    this.emit()
  }
  pause(): void {
    this.playing = false
    this.emit()
  }
  togglePlay(): void {
    this.playing ? this.pause() : this.play()
  }

  // --- Propriétés animées ---
  isAnimated(prop: string): boolean {
    return this.keyframes.some((k) => k.prop === prop)
  }
  /** Keyframe de `prop` à `time` (à une demi-image près). */
  keyAt(prop: string, time: number): Keyframe | undefined {
    return this.keyframes.find((k) => k.prop === prop && Math.abs(k.time - time) < HALF_FRAME)
  }
  /**
   * État des propriétés au playhead : toutes ont une keyframe ici (`key`),
   * au moins une est animée (`animated`), ou aucune ne l'est (`static`).
   */
  keyState(props: readonly string[]): KeyState {
    const t = snapToFrame(this.currentTime)
    if (props.every((p) => this.keyAt(p, t))) return 'key'
    return props.some((p) => this.isAnimated(p)) ? 'animated' : 'static'
  }

  /**
   * Propriétés visées quand on ne précise pas lesquelles : celles déjà animées
   * de l'élément sélectionné (ou de tout le personnage) ; si rien ne l'est
   * encore, sa pose — position des membres, du corps, regard.
   */
  private scopeProps(element: string | null = this.selected): PropDef[] {
    const el = element ? ELEMENT_BY_ID[element] : undefined
    const all = el ? el.props : PROPS
    const animated = all.filter((d) => this.isAnimated(d.id))
    if (animated.length > 0) return animated
    return el ? el.primary : PRIMARY_PROPS
  }

  // --- Keyframes : création ---
  private sortKeys(): void {
    this.keyframes.sort((a, b) => a.time - b.time)
  }
  /** Recalcule la pose affichée après un changement de la courbe. */
  private refresh(): void {
    if (this.keyframes.length > 0) {
      this.sampleInto(this.pose, this.currentTime)
      // Les propriétés animées viennent d'être réécrites par la courbe.
      for (const p of [...this.edited]) if (this.isAnimated(p)) this.edited.delete(p)
      this.poseDirty = false
    }
    if (this.keyframes.length < 2) this.playing = false
  }

  /** Écrit la valeur courante de `prop` à l'instant `t` (sur la grille) ; sans historique. */
  private upsertKey(prop: string, t: number): Keyframe {
    const time = Math.max(0, Math.min(this.duration, snapToFrame(t)))
    const v = propValue(this.pose, PROP_BY_ID[prop])
    const existing = this.keyAt(prop, time)
    if (existing) {
      existing.v = v
      return existing
    }
    const k: Keyframe = { id: this.nextId++, prop, time, v, interp: 'smooth' }
    this.keyframes.push(k)
    this.sortKeys()
    return k
  }

  /**
   * Bouton Keyframe, touche K : enregistre au playhead ce qui a été modifié
   * depuis le dernier déplacement du playhead ; sans modification, les
   * propriétés déjà animées de l'élément sélectionné (ou de tout le
   * personnage), à défaut sa pose.
   */
  addKeyframe(): void {
    const props = this.edited.size > 0 ? [...this.edited] : this.scopeProps().map((d) => d.id)
    this.checkpoint()
    this.playing = false
    const time = Math.max(0, Math.min(this.duration, snapToFrame(this.currentTime)))
    const ids = props.map((p) => this.upsertKey(p, time).id)
    this.currentTime = time
    this.keySelection = new Set(ids)
    this.poseDirty = false
    this.edited.clear()
    this.emit()
  }

  /**
   * Bouton keyframe d'une propriété (panneau) : ajoute la keyframe au playhead,
   * ou la retire si toutes les propriétés en ont déjà une ici.
   */
  toggleKeysAtPlayhead(props: readonly string[]): void {
    if (props.length === 0) return
    const time = Math.max(0, Math.min(this.duration, snapToFrame(this.currentTime)))
    const existing = props.map((p) => this.keyAt(p, time))
    this.checkpoint()
    this.playing = false
    if (existing.every((k) => k)) {
      const del = new Set(existing.map((k) => k!.id))
      this.keyframes = this.keyframes.filter((k) => !del.has(k.id))
      this.keySelection = new Set([...this.keySelection].filter((id) => !del.has(id)))
      this.refresh()
    } else {
      this.currentTime = time
      this.keySelection = new Set(props.map((p) => this.upsertKey(p, time).id))
      for (const p of props) this.edited.delete(p)
      this.updateDirty()
    }
    this.emit()
  }

  /**
   * Insère des keyframes en `t` **sans changer le mouvement** : elles
   * reprennent la valeur que l'animation a déjà à cet instant. Sert à poser un
   * point de contrôle qu'on retouchera ensuite. `props` : les propriétés
   * visées (une piste de la timeline), sinon tout ce qui est animé.
   */
  insertKeyframeAt(t: number, props?: readonly string[]): void {
    const time = Math.max(0, Math.min(this.duration, snapToFrame(t)))
    const targets = props ?? this.scopeProps(null).map((d) => d.id)
    this.checkpoint()
    this.playing = false
    const sampled = clonePose(this.pose)
    this.sampleInto(sampled, time)
    const ids: number[] = []
    for (const prop of targets) {
      let k = this.keyAt(prop, time)
      if (!k) {
        const prev = [...this.keyframes].reverse().find((x) => x.prop === prop && x.time < time)
        k = {
          id: this.nextId++,
          prop,
          time,
          v: propValue(sampled, PROP_BY_ID[prop]),
          interp: prev?.interp ?? 'smooth',
        }
        this.keyframes.push(k)
      }
      ids.push(k.id)
    }
    this.sortKeys()
    this.keySelection = new Set(ids)
    this.setTime(time)
  }

  // --- Keyframes : sélection ---
  setKeySelection(ids: Iterable<number>): void {
    this.keySelection = new Set(ids)
    this.emit()
  }
  toggleKeySelection(ids: readonly number[]): void {
    const s = new Set(this.keySelection)
    const all = ids.every((id) => s.has(id))
    for (const id of ids) {
      if (all) s.delete(id)
      else s.add(id)
    }
    this.keySelection = s
    this.emit()
  }
  selectAllKeys(): void {
    this.setKeySelection(this.keyframes.map((k) => k.id))
  }
  clearKeySelection(): void {
    if (this.keySelection.size === 0) return
    this.setKeySelection([])
  }
  get selectedKeyframes(): Keyframe[] {
    return this.keyframes.filter((k) => this.keySelection.has(k.id))
  }

  goToKeyframe(id: number): void {
    const k = this.keyframes.find((x) => x.id === id)
    if (!k) return
    this.playing = false
    this.setTime(k.time)
  }
  /**
   * Saute au temps de keyframe précédent / suivant — de l'élément sélectionné
   * s'il est animé, sinon de toutes les pistes — et sélectionne ce qui s'y trouve.
   */
  jumpToKeyframe(dir: -1 | 1): void {
    const el = this.selected ? ELEMENT_BY_ID[this.selected] : undefined
    let keys = this.keyframes
    if (el) {
      const own = new Set(el.props.map((d) => d.id))
      const mine = keys.filter((k) => own.has(k.prop))
      if (mine.length > 0) keys = mine
    }
    const t = this.currentTime
    const eps = 1e-4
    const k =
      dir < 0
        ? [...keys].reverse().find((x) => x.time < t - eps)
        : keys.find((x) => x.time > t + eps)
    if (!k) return
    this.keySelection = new Set(
      keys.filter((x) => Math.abs(x.time - k.time) < HALF_FRAME).map((x) => x.id),
    )
    this.playing = false
    this.setTime(k.time)
  }

  // --- Keyframes : édition ---
  deleteKeyframes(ids: Iterable<number>): void {
    const del = new Set(ids)
    if (del.size === 0) return
    this.checkpoint()
    this.keyframes = this.keyframes.filter((k) => !del.has(k.id))
    this.keySelection = new Set([...this.keySelection].filter((id) => !del.has(id)))
    this.refresh()
    this.emit()
  }
  deleteSelected(): void {
    this.deleteKeyframes(this.keySelection)
  }
  clearKeyframes(): void {
    if (this.keyframes.length === 0) return
    this.checkpoint()
    this.keyframes = []
    this.keySelection = new Set()
    this.playing = false
    this.poseDirty = false
    this.edited.clear()
    this.emit()
  }

  setInterp(ids: Iterable<number>, interp: Interp): void {
    const set = new Set(ids)
    this.checkpoint()
    for (const k of this.keyframes) if (set.has(k.id)) k.interp = interp
    this.refresh()
    this.emit()
  }

  /**
   * Une keyframe sélectionnée qui tombe sur une autre **de la même
   * propriété** (à moins d'une demi-image) la remplace : deux valeurs au même
   * instant n'ont pas de sens.
   */
  private mergeSelected(): void {
    const sel = this.selectedKeyframes
    if (sel.length === 0) return
    this.keyframes = this.keyframes.filter(
      (k) =>
        this.keySelection.has(k.id) ||
        !sel.some((s) => s.prop === k.prop && Math.abs(s.time - k.time) < HALF_FRAME),
    )
  }

  /** Décale la sélection d'un bloc, bornée à [0, durée]. */
  private shiftSelection(origin: Map<number, number>, delta: number): void {
    let min = Infinity
    let max = -Infinity
    for (const t of origin.values()) {
      min = Math.min(min, t)
      max = Math.max(max, t)
    }
    delta = Math.max(-min, Math.min(this.duration - max, delta))
    for (const k of this.keyframes) {
      const t0 = origin.get(k.id)
      if (t0 !== undefined) k.time = t0 + delta
    }
    this.sortKeys()
  }

  /**
   * Décalage **en boucle** : quand la lecture boucle et que la sélection
   * couvre des pistes entières qui sont des cycles fermés (une keyframe au
   * début, une à la fin, même valeur), décaler ne doit pas buter sur les
   * bords — ce qui sort par la fin rentre par le début. C'est ce qui permet
   * de faire partir un bras d'une marche avant l'autre : sans ça, ses
   * keyframes occupent déjà toute la durée et ne peuvent pas bouger.
   *
   * Renvoie le plan (keyframes d'origine par propriété), ou `null` si la
   * sélection ne s'y prête pas : on revient alors au décalage borné.
   */
  private wrapPlan(): WrapTrack[] | null {
    if (!this.loop) return null
    const sel = this.selectedKeyframes
    if (sel.length === 0) return null
    const D = this.duration
    const plan: WrapTrack[] = []
    for (const prop of new Set(sel.map((k) => k.prop))) {
      const keys = this.keyframes.filter((k) => k.prop === prop)
      if (!keys.every((k) => this.keySelection.has(k.id))) return null
      const first = keys[0]
      const last = keys[keys.length - 1]
      const closed =
        keys.length >= 2 &&
        first.time < HALF_FRAME &&
        Math.abs(last.time - D) < HALF_FRAME &&
        first.v.every((x, c) => Math.abs(x - last.v[c]) < 1e-6)
      if (!closed) return null
      plan.push({ prop, keys: keys.map(cloneKey), startId: this.nextId++ })
    }
    return plan
  }

  /** Fait tourner chaque cycle du plan de `delta` secondes. */
  private applyWrap(plan: WrapTrack[], delta: number): void {
    const D = this.duration
    const phi = ((delta % D) + D) % D
    const wrapped = new Set(plan.map((w) => w.prop))
    const next = this.keyframes.filter((k) => !wrapped.has(k.prop))
    const tmp = clonePose(this.pose)
    for (const w of plan) {
      const d = PROP_BY_ID[w.prop]
      const closing = w.keys[w.keys.length - 1]
      const inner = w.keys.slice(0, -1)
      for (const k of inner) {
        let t = k.time + phi
        if (t >= D - 1e-9) t -= D
        next.push({ ...cloneKey(k), time: Math.max(0, t) })
      }
      // Le début et la fin du cycle tombent maintenant au milieu d'un segment
      // d'origine : on y pose la valeur de l'animation d'origine, pour que le
      // cycle reste fermé.
      const s = D - phi
      const onStart = phi < 1e-9 || inner.some((k) => Math.abs(k.time - s) < 1e-9)
      this.sampleProp(d, w.keys, s % D, tmp)
      const v = propValue(tmp, d)
      const from = [...w.keys].reverse().find((k) => k.time <= s) ?? w.keys[0]
      if (!onStart) next.push({ id: w.startId, prop: w.prop, time: 0, v, interp: from.interp })
      next.push({ ...cloneKey(closing), time: D, v: onStart ? [...closing.v] : [...v], interp: from.interp })
    }
    this.keyframes = next
    this.sortKeys()
    // La keyframe de début, créée par la rotation, fait partie du bloc.
    const ids = new Set(this.keySelection)
    for (const w of plan) if (this.keyframes.some((k) => k.id === w.startId)) ids.add(w.startId)
    this.keySelection = ids
  }

  /**
   * Glissé de keyframes dans la timeline. `duplicate` (Alt) : une copie reste
   * en place et c'est l'original qui part.
   */
  beginKeyDrag(duplicate: boolean): void {
    this.checkpoint()
    this.playing = false
    const sel = this.selectedKeyframes
    this.wrapDrag = duplicate ? null : this.wrapPlan()
    if (duplicate) {
      for (const k of sel) this.keyframes.push({ ...cloneKey(k), id: this.nextId++ })
      this.sortKeys()
    }
    this.dragOrigin = new Map(sel.map((k) => [k.id, k.time]))
  }
  /** Amène la keyframe `leadId` en `rawTime` (sur la grille) ; la sélection suit en bloc. */
  dragKeys(leadId: number, rawTime: number): void {
    const origin = this.dragOrigin
    const lead = origin?.get(leadId)
    if (!origin || lead === undefined) return
    const delta = snapToFrame(rawTime) - lead
    if (this.wrapDrag) this.applyWrap(this.wrapDrag, delta)
    else this.shiftSelection(origin, delta)
    this.refreshPoseOnly()
    this.emit()
  }
  endKeyDrag(): void {
    if (!this.dragOrigin) return
    this.dragOrigin = null
    if (!this.wrapDrag) this.mergeSelected()
    this.wrapDrag = null
    this.refresh()
    this.emit()
  }
  /** Pendant un glissé : la scène suit la courbe, sans toucher au reste. */
  private refreshPoseOnly(): void {
    if (this.keyframes.length > 0) this.sampleInto(this.pose, this.currentTime)
  }

  /** Décale la sélection de `frames` images (flèches). */
  nudgeSelected(frames: number): void {
    const sel = this.selectedKeyframes
    if (sel.length === 0) return
    // Une rafale de flèches sur la même sélection = un seul décalage en
    // boucle, refait depuis l'origine : sinon chaque appui ajouterait sa
    // keyframe de début.
    const nw = this.nudgeWrap
    const same =
      nw !== null &&
      this.lastTag === 'nudge' &&
      performance.now() - this.lastAt < COALESCE_MS &&
      nw.ids.size === this.keySelection.size &&
      [...nw.ids].every((id) => this.keySelection.has(id))
    this.checkpoint('nudge')
    const plan = same ? nw.plan : this.wrapPlan()
    if (plan) {
      const delta = (same ? nw.delta : 0) + frames * FRAME
      this.applyWrap(plan, delta)
      this.nudgeWrap = { plan, delta, ids: new Set(this.keySelection) }
    } else {
      this.nudgeWrap = null
      this.shiftSelection(new Map(sel.map((k) => [k.id, k.time])), frames * FRAME)
      this.mergeSelected()
    }
    this.refresh()
    this.emit()
  }

  /** Amène la sélection (sa première keyframe) à un temps précis (champ « à »). */
  setSelectionTime(t: number): void {
    const sel = this.selectedKeyframes
    if (sel.length === 0 || !Number.isFinite(t)) return
    const time = Math.max(0, Math.min(this.duration, snapToFrame(t)))
    const delta = time - sel[0].time
    if (Math.abs(delta) < 1e-9) return
    this.checkpoint()
    this.shiftSelection(new Map(sel.map((k) => [k.id, k.time])), delta)
    this.mergeSelected()
    this.refresh()
    this.emit()
  }

  /** Renverse la sélection dans le temps (l'aller devient le retour). */
  reverseSelected(): void {
    const sel = this.selectedKeyframes
    if (sel.length < 2) return
    this.checkpoint()
    const min = sel[0].time
    const max = sel[sel.length - 1].time
    for (const k of sel) k.time = min + max - k.time
    this.sortKeys()
    this.refresh()
    this.emit()
  }

  copySelected(): void {
    const sel = this.selectedKeyframes
    if (sel.length === 0) return
    const t0 = sel[0].time
    this.clipboard = sel.map((k) => ({ dt: k.time - t0, prop: k.prop, v: [...k.v], interp: k.interp }))
    this.emit()
  }

  /**
   * Colle le presse-papiers à partir de `at` (le playhead par défaut), sur les
   * mêmes propriétés. Les keyframes collées remplacent celles qui occupent les
   * mêmes instants, et la durée s'allonge si le bloc dépasse la fin.
   */
  paste(at = this.currentTime): void {
    const clip = this.clipboard
    if (!clip || clip.length === 0) return
    this.checkpoint()
    this.playing = false
    const base = Math.max(0, snapToFrame(at))
    const ids: number[] = []
    for (const c of clip) {
      const time = base + c.dt
      if (time > this.duration) this.duration = time
      const id = this.nextId++
      ids.push(id)
      this.keyframes.push({ id, prop: c.prop, time, v: [...c.v], interp: c.interp })
    }
    this.sortKeys()
    this.keySelection = new Set(ids)
    this.mergeSelected()
    this.refresh()
    this.emit()
  }

  /**
   * Duplique la sélection au playhead — ou juste après elle quand le playhead
   * est dessus (sinon la copie se collerait sur l'original).
   */
  duplicateSelected(): void {
    const sel = this.selectedKeyframes
    if (sel.length === 0) return
    const saved = this.clipboard
    this.copySelected()
    const t = this.currentTime
    const inside = t >= sel[0].time - HALF_FRAME && t <= sel[sel.length - 1].time + HALF_FRAME
    this.paste(inside ? sel[sel.length - 1].time + FRAME : t)
    this.clipboard = saved
    this.emit()
  }

  /**
   * Découpe des poses datées (presets, ancien format) en keyframes par
   * propriété. Une propriété qui ne bouge pas n'est pas animée : sa valeur est
   * posée dans la pose courante, et la timeline n'affiche que ce qui bouge.
   */
  private keysFromPoses(frames: PoseFrame[]): Keyframe[] {
    const keys: Keyframe[] = []
    for (const d of PRIMARY_PROPS) {
      const vals = frames.map((f) => propValue(f.pose, d))
      const still =
        frames.length > 1 && vals.every((v) => v.every((x, c) => Math.abs(x - vals[0][c]) < 1e-6))
      if (still) {
        writeProp(this.pose, d, vals[0])
        continue
      }
      frames.forEach((f, i) =>
        keys.push({ id: this.nextId++, prop: d.id, time: f.time, v: vals[i], interp: f.interp }),
      )
    }
    return keys.sort((a, b) => a.time - b.time)
  }

  /**
   * Échantillonne une animation procédurale en keyframes éditables.
   *
   * L'interpolation `linear` des presets suffit : leur fluidité vient de la
   * densité d'échantillonnage (`def.samples`). On génère `samples + 1` frames
   * (bornes incluses) : pour un cycle, la dernière rejoint exactement la
   * première, ce qui fait boucler la lecture sans plateau final.
   *
   * La forme des membres (rondeur, pli) est posée en valeur fixe, pas animée.
   * Remplace les keyframes existantes — l'appelant prévient l'utilisateur, et
   * c'est annulable.
   */
  loadAnimation(def: AnimationDef): void {
    this.checkpoint()
    const ctx = { scale: this.viewScale || 1, anchors: this.anchors }
    const frames: PoseFrame[] = []
    for (let i = 0; i <= def.samples; i++) {
      const u = i / def.samples
      frames.push({
        time: Math.round(u * def.duration * 1000) / 1000,
        pose: { ...def.sample(u, ctx), shape: this.pose.shape },
        interp: 'linear',
      })
    }

    for (const l of LIMBS) {
      const st = { ...def.style, ...def.limbStyle?.[l.key] }
      this.pose.shape[l.key] = { curve: st.curve, bendDeg: st.bendDeg }
      this.stretch[l.key] = st.stretch
    }
    // Curseurs déliés dès que le preset règle les membres séparément : liés,
    // le panneau n'afficherait que la valeur du premier membre.
    this.styleLinked = def.limbStyle === undefined
    this.depthSort = def.depthSort ?? 'none'
    this.keyframes = this.keysFromPoses(frames)
    this.keySelection = new Set()
    this.duration = def.duration
    this.loop = def.loop
    this.playing = false
    this.poseDirty = false
    this.edited.clear()
    this.currentTime = 0
    this.sampleInto(this.pose, 0)
    this.emit()
  }

  tick(dt: number): void {
    if (!this.playing) return
    let t = this.currentTime + dt
    if (t >= this.duration) {
      if (this.loop) t = t % this.duration
      else {
        t = this.duration
        this.playing = false
        // Fin d'un one-shot : React doit revoir le bouton Lire.
        this.currentTime = t
        this.sampleInto(this.pose, t)
        this.emit()
        return
      }
    }
    this.currentTime = t
    this.sampleInto(this.pose, t)
  }

  /** Écrit dans `out` la valeur à l'instant `t` de chaque propriété animée. */
  sampleInto(out: Pose, t: number): void {
    const groups = this.groups
    for (const id in groups) groups[id].length = 0
    for (const k of this.keyframes) groups[k.prop]?.push(k)
    for (const d of PROPS) {
      const kfs = groups[d.id]
      if (kfs.length > 0) this.sampleProp(d, kfs, t, out)
    }
  }

  /**
   * Interpolation d'une propriété. La position d'un membre est interpolée en
   * **polaire** autour de son attache (angle + extension) : entre deux
   * keyframes, la main décrit un arc au lieu de couper en ligne droite — un
   * bras qui balance ne se replie donc plus à mi-course.
   */
  private sampleProp(d: PropDef, kfs: Keyframe[], t: number, out: Pose): void {
    const n = kfs.length
    if (n === 1 || t <= kfs[0].time) return writeProp(out, d, kfs[0].v)
    if (t >= kfs[n - 1].time) return writeProp(out, d, kfs[n - 1].v)

    // Segment [i, i+1] qui contient t ; une keyframe exactement atteinte
    // appartient au segment qu'elle ouvre (important pour `hold`).
    let i = 0
    while (i < n - 2 && t >= kfs[i + 1].time) i++
    const a = kfs[i]
    const b = kfs[i + 1]
    const h = b.time - a.time
    const f = h > 0 ? (t - a.time) / h : 1

    if (a.interp === 'hold') return writeProp(out, d, a.v)

    const anchor = d.kind === 'limb-pos' ? this.anchors[d.limb!] : null
    const A = this.load(this.chA, a.v, anchor, null)
    const B = this.load(this.chB, b.v, anchor, A)
    const O = this.chOut

    if (a.interp === 'smooth') {
      const p = kfs[i - 1]
      const nx = kfs[i + 2]
      const P = p ? this.load(this.chP, p.v, anchor, A) : null
      const N = nx ? this.load(this.chN, nx.v, anchor, B) : null
      const s = f
      const s2 = s * s
      const s3 = s2 * s
      const h00 = 2 * s3 - 3 * s2 + 1
      const h10 = s3 - 2 * s2 + s
      const h01 = -2 * s3 + 3 * s2
      const h11 = s3 - s2
      for (let c = 0; c < d.size; c++) {
        // Aux bornes de l'animation, départ et arrivée à vitesse nulle.
        const ma = P ? tangent(P[c], A[c], B[c], p.time, a.time, b.time) : 0
        const mb = N ? tangent(A[c], B[c], N[c], a.time, b.time, nx.time) : 0
        O[c] = h00 * A[c] + h10 * h * ma + h01 * B[c] + h11 * h * mb
      }
    } else {
      const w = a.interp === 'ease' ? easeInOut(f) : f
      for (let c = 0; c < d.size; c++) O[c] = lerp(A[c], B[c], w)
    }

    if (anchor) {
      const ang = O[0]
      const dist = O[1]
      O[0] = anchor.x + Math.sin(ang) * dist
      O[1] = anchor.y + Math.cos(ang) * dist
    }
    writeProp(out, d, O)
  }

  /**
   * Charge les valeurs d'une keyframe dans un buffer — en polaire pour une
   * position de membre, l'angle déroulé au plus près de `ref` (sinon un bras
   * qui passe de 179° à -179° ferait le tour complet).
   */
  private load(buf: Float64Array, v: number[], anchor: Vec | null, ref: Float64Array | null) {
    if (!anchor) {
      buf[0] = v[0]
      buf[1] = v[1] ?? 0
      return buf
    }
    const dx = v[0] - anchor.x
    const dy = v[1] - anchor.y
    const ang = Math.atan2(dx, dy)
    buf[0] = ref ? ref[0] + wrapPi(ang - ref[0]) : ang
    buf[1] = Math.hypot(dx, dy)
    return buf
  }

  // --- Document (export, ouverture, sauvegarde automatique) ---
  toJSON(): string {
    return JSON.stringify(
      {
        format: 'mynd-rig',
        version: 3,
        fps: FPS,
        duration: this.duration,
        loop: this.loop,
        anchors: this.anchors,
        stretch: this.stretch,
        styleLinked: this.styleLinked,
        depthSort: this.depthSort,
        pose: this.pose,
        keyframes: this.keyframes.map((k) => ({
          prop: k.prop,
          time: k.time,
          interp: k.interp,
          value: k.v,
        })),
      },
      null,
      2,
    )
  }

  /**
   * Ouvre un document exporté. Accepte les anciens formats : version 2 (une
   * keyframe = une pose complète, découpée ici par propriété) et version 1
   * (sans interpolation : les keyframes sont alors `linear`, ce qu'elles
   * étaient). Rejette — sans rien modifier — un fichier qui n'est pas une
   * animation Mynd.
   *
   * `history: false` pour la restauration au démarrage (rien à annuler).
   */
  loadJSON(text: string, { history = true } = {}): boolean {
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      return false
    }
    const doc = parseDocument(raw)
    if (!doc) return false
    if (history) this.checkpoint()
    if (doc.anchors) this.anchors = doc.anchors
    this.pose = doc.pose
    if (doc.stretch) this.stretch = doc.stretch
    this.keyframes = doc.keys
      ? doc.keys.map((k) => ({ ...k, id: this.nextId++ }))
      : this.keysFromPoses(doc.frames)
    this.sortKeys()
    this.duration = Math.max(MIN_DURATION, doc.duration, this.lastKeyTime)
    this.loop = doc.loop
    this.styleLinked = doc.styleLinked
    this.depthSort = doc.depthSort
    this.keySelection = new Set()
    this.playing = false
    this.poseDirty = false
    this.edited.clear()
    this.currentTime = 0
    this.sampleInto(this.pose, 0)
    this.emit()
    return true
  }
}

// --- Lecture d'un document ---------------------------------------------------
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

function parseVec(v: unknown, fallback: Vec): Vec {
  const o = (v ?? {}) as Partial<Vec>
  return { x: num(o.x, fallback.x), y: num(o.y, fallback.y) }
}

function parsePose(v: unknown): Pose {
  const o = (v ?? {}) as Partial<Pose>
  const rest = emptyPose()
  for (const l of LIMBS) {
    rest.targets[l.key] = parseVec(o.targets?.[l.key], rest.targets[l.key])
    const s = (o.shape?.[l.key] ?? {}) as Partial<LimbShape>
    rest.shape[l.key] = { curve: num(s.curve, 1), bendDeg: num(s.bendDeg, 0) }
  }
  rest.bodyX = num(o.bodyX, 0)
  rest.bodyY = num(o.bodyY, 0)
  rest.bodyRot = num(o.bodyRot, 0)
  rest.gazeX = num(o.gazeX, 0)
  rest.gazeY = num(o.gazeY, 0)
  return rest
}

const parseInterp = (v: unknown): Interp => (INTERPS.includes(v as Interp) ? (v as Interp) : 'linear')

function parseDocument(raw: unknown) {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!Array.isArray(o.keyframes)) return null

  let anchors: Anchors | null = null
  if (o.anchors && typeof o.anchors === 'object') {
    anchors = {}
    for (const l of LIMBS) anchors[l.key] = parseVec((o.anchors as Anchors)[l.key], l.anchor)
  }

  let pose: Pose
  let stretch: Record<string, boolean> | null = null
  let keys: Omit<Keyframe, 'id'>[] | null = null
  let frames: PoseFrame[] = []

  if (num(o.version, 1) >= 3) {
    // Une keyframe par propriété ; la pose porte les valeurs non animées.
    pose = parsePose(o.pose)
    if (o.stretch && typeof o.stretch === 'object') {
      const st = o.stretch as Record<string, unknown>
      stretch = Object.fromEntries(LIMBS.map((l) => [l.key, st[l.key] === true]))
    }
    keys = []
    for (const k of o.keyframes as unknown[]) {
      const kk = (k ?? {}) as Record<string, unknown>
      const d = PROP_BY_ID[kk.prop as string]
      const value = kk.value
      if (!d || !Array.isArray(value) || value.length !== d.size) continue
      if (!value.every((x) => typeof x === 'number' && Number.isFinite(x))) continue
      keys.push({
        prop: d.id,
        time: Math.max(0, num(kk.time, 0)),
        interp: parseInterp(kk.interp),
        v: value as number[],
      })
    }
  } else {
    // Ancien format : une keyframe = une pose complète, forme des membres en
    // réglage (`limbStyle`).
    pose = emptyPose()
    if (o.limbStyle && typeof o.limbStyle === 'object') {
      stretch = {}
      for (const l of LIMBS) {
        const s = ((o.limbStyle as Record<string, Partial<LimbStyle>>)[l.key] ?? {}) as Partial<LimbStyle>
        pose.shape[l.key] = { curve: num(s.curve, 1), bendDeg: num(s.bendDeg, 0) }
        stretch[l.key] = s.stretch === true
      }
    }
    frames = (o.keyframes as unknown[]).map((k) => {
      const kk = (k ?? {}) as Record<string, unknown>
      return {
        time: Math.max(0, num(kk.time, 0)),
        interp: parseInterp(kk.interp),
        pose: parsePose(kk.pose),
      }
    })
    frames.sort((a, b) => a.time - b.time)
  }

  const ds = o.depthSort
  return {
    keys,
    frames,
    pose,
    stretch,
    duration: num(o.duration, 4),
    loop: o.loop !== false,
    anchors,
    styleLinked: o.styleLinked !== false,
    depthSort: (ds === 'legs' || ds === 'all' ? ds : 'none') as DepthSort | 'none',
  }
}

export const rigStore = new RigStore()

// Exposition pour inspection / tests en développement.
if (import.meta.env.DEV) {
  ;(window as unknown as { __rig?: RigStore }).__rig = rigStore
}
