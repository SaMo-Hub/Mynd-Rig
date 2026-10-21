import { CHAR_CX, CHAR_CY, GAZE_MAX, LIMBS } from '../rig/rigData'
import type { AnimationDef, DepthSort, LimbStyle } from '../rig/animations'

export type Mode = 'pose' | 'rig'

export interface Vec {
  x: number
  y: number
}

/** Une pose = ce qui est animé par la timeline. */
export interface Pose {
  /** cible d'extrémité (main / pied) de chaque membre, coords locales. */
  targets: Record<string, Vec>
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
 * - `hold` : la pose tient jusqu'à la keyframe suivante, puis saute.
 */
export type Interp = 'smooth' | 'linear' | 'ease' | 'hold'
export const INTERPS: readonly Interp[] = ['smooth', 'linear', 'ease', 'hold']

export interface Keyframe {
  id: number
  time: number
  pose: Pose
  interp: Interp
}

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

export function emptyPose(): Pose {
  const targets: Record<string, Vec> = {}
  for (const l of LIMBS) targets[l.key] = { ...l.restTarget }
  return { targets, bodyX: 0, bodyY: 0, bodyRot: 0, gazeX: 0, gazeY: 0 }
}

export function clonePose(p: Pose): Pose {
  const targets: Record<string, Vec> = {}
  for (const k in p.targets) targets[k] = { ...p.targets[k] }
  return {
    targets,
    bodyX: p.bodyX,
    bodyY: p.bodyY,
    bodyRot: p.bodyRot,
    gazeX: p.gazeX,
    gazeY: p.gazeY,
  }
}

function cloneKey(k: Keyframe): Keyframe {
  return { id: k.id, time: k.time, pose: clonePose(k.pose), interp: k.interp }
}

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f
}

function easeInOut(f: number): number {
  return f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2
}

// --- Canaux ------------------------------------------------------------------
// L'interpolation lisse a besoin des voisins de chaque keyframe, canal par
// canal : la pose est aplatie en un vecteur de nombres (buffers réutilisés, pas
// d'allocation par frame).
const LIMB_KEYS = LIMBS.map((l) => l.key)
const N_CH = LIMB_KEYS.length * 2 + 5

function readChannels(p: Pose, out: Float64Array): void {
  let i = 0
  for (const k of LIMB_KEYS) {
    const t = p.targets[k]
    out[i++] = t?.x ?? 0
    out[i++] = t?.y ?? 0
  }
  out[i++] = p.bodyX
  out[i++] = p.bodyY
  out[i++] = p.bodyRot
  out[i++] = p.gazeX
  out[i] = p.gazeY
}

function writeChannels(src: Float64Array, out: Pose): void {
  let i = 0
  for (const k of LIMB_KEYS) {
    out.targets[k] = { x: src[i], y: src[i + 1] }
    i += 2
  }
  out.bodyX = src[i++]
  out.bodyY = src[i++]
  out.bodyRot = src[i++]
  out.gazeX = src[i++]
  out.gazeY = src[i]
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
  limbStyle: Record<string, LimbStyle>
  styleLinked: boolean
  depthSort: DepthSort | 'none'
  keySelection: number[]
  currentTime: number
}

interface ClipKey {
  /** temps relatif à la première keyframe copiée. */
  dt: number
  pose: Pose
  interp: Interp
}

/**
 * Store d'état de l'éditeur. Pixi lit `pose` / `anchors` en direct chaque frame
 * (drag et lecture fluides). React ne s'abonne qu'aux changements structurels.
 *
 * Épinglage : les extrémités `pinned` (les pieds) restent fixes dans le monde
 * quand le corps bouge. Comme les cibles sont stockées en coords locales, on
 * compense la cible à chaque déplacement / rotation du corps.
 *
 * Historique : chaque geste qui modifie le document pose un `checkpoint()`
 * **avant** de le modifier. Un glissé sur la scène = un seul pas (préparé au
 * `beginGesture`, versé au premier changement) ; les réglages continus
 * (curseurs, flèches) sont fusionnés.
 */
class RigStore {
  mode: Mode = 'pose'
  selected: string | null = null
  /** échelle de rendu, écrite par le canvas (nécessaire à la compensation). */
  viewScale = 1

  anchors: Anchors = Object.fromEntries(LIMBS.map((l) => [l.key, { ...l.anchor }]))
  pose: Pose = emptyPose()

  /** Style de pliage par membre (config, non animé). */
  limbStyle: Record<string, LimbStyle> =
    Object.fromEntries(LIMBS.map((l) => [l.key, { curve: 1, bendDeg: 0, stretch: false }]))
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

  keyframes: Keyframe[] = []
  duration = 4
  currentTime = 0
  playing = false
  loop = true

  /**
   * Auto-keyframe : toute modification de la pose s'enregistre à l'instant du
   * playhead (crée la keyframe ou met à jour celle qui s'y trouve).
   */
  autoKey = false
  /** Keyframes sélectionnées dans la timeline (ids). */
  keySelection = new Set<number>()
  /**
   * La pose affichée a été modifiée sans être enregistrée : le prochain
   * déplacement du playhead la perdra. Toujours faux en auto-keyframe.
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

  // Buffers de l'interpolation.
  private chP = new Float64Array(N_CH)
  private chA = new Float64Array(N_CH)
  private chB = new Float64Array(N_CH)
  private chN = new Float64Array(N_CH)
  private chOut = new Float64Array(N_CH)

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
    const limbStyle: Record<string, LimbStyle> = {}
    for (const k in this.limbStyle) limbStyle[k] = { ...this.limbStyle[k] }
    const anchors: Anchors = {}
    for (const k in this.anchors) anchors[k] = { ...this.anchors[k] }
    return {
      keyframes: this.keyframes.map(cloneKey),
      duration: this.duration,
      loop: this.loop,
      pose: clonePose(this.pose),
      anchors,
      limbStyle,
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
    this.limbStyle = s.limbStyle
    this.styleLinked = s.styleLinked
    this.depthSort = s.depthSort
    this.keySelection = new Set(s.keySelection)
    this.currentTime = s.currentTime
    this.playing = false
    this.poseDirty = false
    this.dragOrigin = null
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

  /** Après toute modification de la pose : auto-keyframe, ou pose « non enregistrée ». */
  private poseEdited(): void {
    this.commitPending()
    if (this.autoKey) {
      const k = this.upsertKey(this.currentTime)
      if (this.keySelection.size !== 1 || !this.keySelection.has(k.id)) {
        this.keySelection = new Set([k.id])
      }
      this.poseDirty = false
    } else if (this.keyframes.length > 0) {
      this.poseDirty = true
    }
  }

  setTarget(key: string, x: number, y: number): void {
    this.pose.targets[key] = { x, y }
    this.poseEdited()
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
    this.poseEdited()
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
  resetPose(): void {
    this.checkpoint()
    this.playing = false
    this.pose = emptyPose()
    this.poseEdited()
    this.emit()
  }

  // --- Style de pliage ---
  setStyleLinked(v: boolean): void {
    this.checkpoint()
    this.styleLinked = v
    this.emit()
  }
  setLimbStyle(
    key: string,
    partial: Partial<{ curve: number; bendDeg: number; stretch: boolean }>,
  ): void {
    this.checkpoint(`style:${key}`)
    this.limbStyle[key] = { ...this.limbStyle[key], ...partial }
    this.emit()
  }
  setAllStyle(partial: Partial<LimbStyle>): void {
    this.checkpoint('style:all')
    for (const l of LIMBS) this.limbStyle[l.key] = { ...this.limbStyle[l.key], ...partial }
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
      t.x -= ldx
      t.y -= ldy
    }
    this.poseEdited()
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
      t.x = CHAR_CX + px * c - py * s
      t.y = CHAR_CY + px * s + py * c
    }
    this.pose.bodyRot = newRot
    this.poseEdited()
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
    if (this.keyframes.length > 0) this.poseDirty = false
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
    this.emit()
  }
  pause(): void {
    this.playing = false
    this.emit()
  }
  togglePlay(): void {
    this.playing ? this.pause() : this.play()
  }

  // --- Keyframes : création ---
  private keyAt(time: number): Keyframe | undefined {
    return this.keyframes.find((k) => Math.abs(k.time - time) < HALF_FRAME)
  }
  private sortKeys(): void {
    this.keyframes.sort((a, b) => a.time - b.time)
  }
  /** Recalcule la pose affichée après un changement de la courbe. */
  private refresh(): void {
    if (this.keyframes.length > 0) {
      this.sampleInto(this.pose, this.currentTime)
      this.poseDirty = false
    }
    if (this.keyframes.length < 2) this.playing = false
  }

  /** Écrit la pose courante à l'instant `t` (sur la grille) ; sans historique. */
  private upsertKey(t: number): Keyframe {
    const time = Math.max(0, Math.min(this.duration, snapToFrame(t)))
    const existing = this.keyAt(time)
    if (existing) {
      existing.pose = clonePose(this.pose)
      return existing
    }
    const k: Keyframe = { id: this.nextId++, time, pose: clonePose(this.pose), interp: 'smooth' }
    this.keyframes.push(k)
    this.sortKeys()
    return k
  }

  /** Enregistre la pose actuelle au playhead (bouton Keyframe, touche K). */
  addKeyframe(): void {
    this.checkpoint()
    this.playing = false
    const k = this.upsertKey(this.currentTime)
    this.currentTime = k.time
    this.keySelection = new Set([k.id])
    this.poseDirty = false
    this.emit()
  }

  /**
   * Insère une keyframe en `t` **sans changer le mouvement** : elle reprend la
   * pose que l'animation a déjà à cet instant. Sert à poser un point de
   * contrôle qu'on retouchera ensuite.
   */
  insertKeyframeAt(t: number): void {
    const time = Math.max(0, Math.min(this.duration, snapToFrame(t)))
    this.checkpoint()
    this.playing = false
    let k = this.keyAt(time)
    if (!k) {
      const pose = clonePose(this.pose)
      this.sampleInto(pose, time)
      const prev = [...this.keyframes].reverse().find((x) => x.time < time)
      k = { id: this.nextId++, time, pose, interp: prev?.interp ?? 'smooth' }
      this.keyframes.push(k)
      this.sortKeys()
    }
    this.keySelection = new Set([k.id])
    this.setTime(k.time)
  }

  // --- Keyframes : sélection ---
  setKeySelection(ids: Iterable<number>): void {
    this.keySelection = new Set(ids)
    this.emit()
  }
  toggleKeySelection(id: number): void {
    const s = new Set(this.keySelection)
    if (s.has(id)) s.delete(id)
    else s.add(id)
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
  /** Saute à la keyframe précédente / suivante et la sélectionne. */
  jumpToKeyframe(dir: -1 | 1): void {
    const t = this.currentTime
    const eps = 1e-4
    const k =
      dir < 0
        ? [...this.keyframes].reverse().find((x) => x.time < t - eps)
        : this.keyframes.find((x) => x.time > t + eps)
    if (!k) return
    this.keySelection = new Set([k.id])
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
   * Une keyframe sélectionnée qui tombe sur une autre (à moins d'une
   * demi-image) la **remplace** : deux poses au même instant n'ont pas de sens.
   */
  private mergeSelected(): void {
    const sel = this.selectedKeyframes
    if (sel.length === 0) return
    this.keyframes = this.keyframes.filter(
      (k) =>
        this.keySelection.has(k.id) || !sel.some((s) => Math.abs(s.time - k.time) < HALF_FRAME),
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
   * Glissé de keyframes dans la timeline. `duplicate` (Alt) : une copie reste
   * en place et c'est l'original qui part.
   */
  beginKeyDrag(duplicate: boolean): void {
    this.checkpoint()
    this.playing = false
    const sel = this.selectedKeyframes
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
    this.shiftSelection(origin, snapToFrame(rawTime) - lead)
    this.refreshPoseOnly()
    this.emit()
  }
  endKeyDrag(): void {
    if (!this.dragOrigin) return
    this.dragOrigin = null
    this.mergeSelected()
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
    this.checkpoint('nudge')
    this.shiftSelection(new Map(sel.map((k) => [k.id, k.time])), frames * FRAME)
    this.mergeSelected()
    this.refresh()
    this.emit()
  }

  /** Place une keyframe à un temps précis (champ « Temps »). */
  setKeyTime(id: number, t: number): void {
    const k = this.keyframes.find((x) => x.id === id)
    if (!k || !Number.isFinite(t)) return
    const time = Math.max(0, Math.min(this.duration, snapToFrame(t)))
    if (Math.abs(time - k.time) < 1e-9) return
    this.checkpoint()
    k.time = time
    this.sortKeys()
    this.keySelection = new Set([id])
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
    this.clipboard = sel.map((k) => ({ dt: k.time - t0, pose: clonePose(k.pose), interp: k.interp }))
    this.emit()
  }

  /**
   * Colle le presse-papiers à partir de `at` (le playhead par défaut). Les
   * keyframes collées remplacent celles qui occupent les mêmes instants, et la
   * durée s'allonge si le bloc dépasse la fin.
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
      this.keyframes.push({ id, time, pose: clonePose(c.pose), interp: c.interp })
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
   * Échantillonne une animation procédurale en keyframes éditables.
   *
   * L'interpolation `linear` des presets suffit : leur fluidité vient de la
   * densité d'échantillonnage (`def.samples`). On génère `samples + 1` frames
   * (bornes incluses) : pour un cycle, la dernière rejoint exactement la
   * première, ce qui fait boucler la lecture sans plateau final.
   *
   * Remplace les keyframes existantes — l'appelant prévient l'utilisateur, et
   * c'est annulable.
   */
  loadAnimation(def: AnimationDef): void {
    this.checkpoint()
    const ctx = { scale: this.viewScale || 1, anchors: this.anchors }
    const frames: Keyframe[] = []
    for (let i = 0; i <= def.samples; i++) {
      const u = i / def.samples
      frames.push({
        id: this.nextId++,
        time: Math.round(u * def.duration * 1000) / 1000,
        pose: def.sample(u, ctx),
        interp: 'linear',
      })
    }

    for (const l of LIMBS) {
      this.limbStyle[l.key] = { ...def.style, ...def.limbStyle?.[l.key] }
    }
    // Curseurs déliés dès que le preset règle les membres séparément : liés,
    // le panneau n'afficherait que la valeur du premier membre.
    this.styleLinked = def.limbStyle === undefined
    this.depthSort = def.depthSort ?? 'none'
    this.keyframes = frames
    this.keySelection = new Set()
    this.duration = def.duration
    this.loop = def.loop
    this.playing = false
    this.poseDirty = false
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

  sampleInto(out: Pose, t: number): void {
    const kfs = this.keyframes
    const n = kfs.length
    if (n === 0) return
    if (t <= kfs[0].time) return this.assign(out, kfs[0].pose)
    if (t >= kfs[n - 1].time) return this.assign(out, kfs[n - 1].pose)

    // Segment [i, i+1] qui contient t ; une keyframe exactement atteinte
    // appartient au segment qu'elle ouvre (important pour `hold`).
    let i = 0
    while (i < n - 2 && t >= kfs[i + 1].time) i++
    const a = kfs[i]
    const b = kfs[i + 1]
    const h = b.time - a.time
    const f = h > 0 ? (t - a.time) / h : 1

    if (a.interp === 'hold') return this.assign(out, a.pose)

    const A = this.chA
    const B = this.chB
    const O = this.chOut
    readChannels(a.pose, A)
    readChannels(b.pose, B)

    if (a.interp === 'smooth') {
      const p = kfs[i - 1]
      const nx = kfs[i + 2]
      if (p) readChannels(p.pose, this.chP)
      if (nx) readChannels(nx.pose, this.chN)
      const s = f
      const s2 = s * s
      const s3 = s2 * s
      const h00 = 2 * s3 - 3 * s2 + 1
      const h10 = s3 - 2 * s2 + s
      const h01 = -2 * s3 + 3 * s2
      const h11 = s3 - s2
      for (let c = 0; c < N_CH; c++) {
        // Aux bornes de l'animation, départ et arrivée à vitesse nulle.
        const ma = p ? tangent(this.chP[c], A[c], B[c], p.time, a.time, b.time) : 0
        const mb = nx ? tangent(A[c], B[c], this.chN[c], a.time, b.time, nx.time) : 0
        O[c] = h00 * A[c] + h10 * h * ma + h01 * B[c] + h11 * h * mb
      }
    } else {
      const w = a.interp === 'ease' ? easeInOut(f) : f
      for (let c = 0; c < N_CH; c++) O[c] = lerp(A[c], B[c], w)
    }
    writeChannels(O, out)
  }

  private assign(out: Pose, src: Pose): void {
    for (const key in out.targets) {
      const s = src.targets[key]
      if (s) out.targets[key] = { x: s.x, y: s.y }
    }
    out.bodyX = src.bodyX
    out.bodyY = src.bodyY
    out.bodyRot = src.bodyRot
    out.gazeX = src.gazeX
    out.gazeY = src.gazeY
  }

  // --- Document (export, ouverture, sauvegarde automatique) ---
  toJSON(): string {
    return JSON.stringify(
      {
        format: 'mynd-rig',
        version: 2,
        fps: FPS,
        duration: this.duration,
        loop: this.loop,
        anchors: this.anchors,
        limbStyle: this.limbStyle,
        styleLinked: this.styleLinked,
        depthSort: this.depthSort,
        keyframes: this.keyframes.map((k) => ({ time: k.time, interp: k.interp, pose: k.pose })),
      },
      null,
      2,
    )
  }

  /**
   * Ouvre un document exporté. Accepte l'ancien format (sans interpolation :
   * les keyframes sont alors `linear`, ce qu'elles étaient). Rejette — sans
   * rien modifier — un fichier qui n'est pas une animation Mynd.
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
    this.keyframes = doc.keyframes.map((k) => ({ ...k, id: this.nextId++ }))
    this.sortKeys()
    this.duration = Math.max(MIN_DURATION, doc.duration, this.lastKeyTime)
    this.loop = doc.loop
    if (doc.anchors) this.anchors = doc.anchors
    if (doc.limbStyle) this.limbStyle = doc.limbStyle
    this.styleLinked = doc.styleLinked
    this.depthSort = doc.depthSort
    this.keySelection = new Set()
    this.playing = false
    this.poseDirty = false
    this.currentTime = 0
    if (this.keyframes.length > 0) this.sampleInto(this.pose, 0)
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
  const targets: Record<string, Vec> = {}
  for (const l of LIMBS) targets[l.key] = parseVec(o.targets?.[l.key], rest.targets[l.key])
  return {
    targets,
    bodyX: num(o.bodyX, 0),
    bodyY: num(o.bodyY, 0),
    bodyRot: num(o.bodyRot, 0),
    gazeX: num(o.gazeX, 0),
    gazeY: num(o.gazeY, 0),
  }
}

function parseDocument(raw: unknown) {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!Array.isArray(o.keyframes)) return null
  const keyframes = o.keyframes.map((k: unknown) => {
    const kk = (k ?? {}) as Record<string, unknown>
    const interp = INTERPS.includes(kk.interp as Interp) ? (kk.interp as Interp) : 'linear'
    return { time: Math.max(0, num(kk.time, 0)), interp, pose: parsePose(kk.pose) }
  })
  let anchors: Anchors | null = null
  if (o.anchors && typeof o.anchors === 'object') {
    anchors = {}
    for (const l of LIMBS) anchors[l.key] = parseVec((o.anchors as Anchors)[l.key], l.anchor)
  }
  let limbStyle: Record<string, LimbStyle> | null = null
  if (o.limbStyle && typeof o.limbStyle === 'object') {
    limbStyle = {}
    for (const l of LIMBS) {
      const s = ((o.limbStyle as Record<string, Partial<LimbStyle>>)[l.key] ?? {}) as Partial<LimbStyle>
      limbStyle[l.key] = {
        curve: num(s.curve, 1),
        bendDeg: num(s.bendDeg, 0),
        stretch: s.stretch === true,
      }
    }
  }
  const ds = o.depthSort
  return {
    keyframes,
    duration: num(o.duration, 4),
    loop: o.loop !== false,
    anchors,
    limbStyle,
    styleLinked: o.styleLinked !== false,
    depthSort: (ds === 'legs' || ds === 'all' ? ds : 'none') as DepthSort | 'none',
  }
}

export const rigStore = new RigStore()

// Exposition pour inspection / tests en développement.
if (import.meta.env.DEV) {
  ;(window as unknown as { __rig?: RigStore }).__rig = rigStore
}
