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

export interface Keyframe {
  id: number
  time: number
  pose: Pose
}

export type Anchors = Record<string, Vec>

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

function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f
}

/**
 * Store d'état de l'éditeur. Pixi lit `pose` / `anchors` en direct chaque frame
 * (drag et lecture fluides). React ne s'abonne qu'aux changements structurels.
 *
 * Épinglage : les extrémités `pinned` (les pieds) restent fixes dans le monde
 * quand le corps bouge. Comme les cibles sont stockées en coords locales, on
 * compense la cible à chaque déplacement / rotation du corps.
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

  private version = 0
  private nextId = 1
  private listeners = new Set<() => void>()

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getSnapshot = (): number => this.version
  private emit(): void {
    this.version++
    this.listeners.forEach((l) => l())
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
  setTarget(key: string, x: number, y: number): void {
    this.pose.targets[key] = { x, y }
    this.emit()
  }
  setAnchor(key: string, x: number, y: number): void {
    this.anchors[key] = { x, y }
    this.emit()
  }
  /** Déplace le regard (borné au blanc de l'œil). */
  setGaze(x: number, y: number): void {
    const d = Math.hypot(x, y)
    if (d > GAZE_MAX && d > 0) {
      x = (x / d) * GAZE_MAX
      y = (y / d) * GAZE_MAX
    }
    this.pose.gazeX = x
    this.pose.gazeY = y
    this.emit()
  }
  setFollowGaze(v: boolean): void {
    this.followGaze = v
    this.emit()
  }
  resetPose(): void {
    this.pose = emptyPose()
    this.emit()
  }

  // --- Style de pliage ---
  setStyleLinked(v: boolean): void {
    this.styleLinked = v
    this.emit()
  }
  setLimbStyle(
    key: string,
    partial: Partial<{ curve: number; bendDeg: number; stretch: boolean }>,
  ): void {
    this.limbStyle[key] = { ...this.limbStyle[key], ...partial }
    this.emit()
  }
  setAllStyle(partial: Partial<LimbStyle>): void {
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
    this.emit()
  }

  // --- Timeline ---
  setDuration(d: number): void {
    this.duration = Math.max(0.5, d)
    this.emit()
  }
  setTime(t: number): void {
    this.currentTime = Math.max(0, Math.min(this.duration, t))
    this.sampleInto(this.pose, this.currentTime)
    this.emit()
  }
  play(): void {
    if (this.keyframes.length < 2) return
    this.playing = true
    this.emit()
  }
  pause(): void {
    this.playing = false
    this.emit()
  }
  togglePlay(): void {
    this.playing ? this.pause() : this.play()
  }

  addKeyframe(): void {
    const time = Math.round(this.currentTime * 100) / 100
    const existing = this.keyframes.find((k) => Math.abs(k.time - time) < 0.001)
    if (existing) existing.pose = clonePose(this.pose)
    else this.keyframes.push({ id: this.nextId++, time, pose: clonePose(this.pose) })
    this.keyframes.sort((a, b) => a.time - b.time)
    this.emit()
  }
  deleteKeyframe(id: number): void {
    this.keyframes = this.keyframes.filter((k) => k.id !== id)
    if (this.keyframes.length < 2) this.playing = false
    this.emit()
  }
  goToKeyframe(id: number): void {
    const k = this.keyframes.find((x) => x.id === id)
    if (k) this.setTime(k.time)
  }

  /**
   * Échantillonne une animation procédurale en keyframes éditables.
   *
   * L'interpolation de la timeline étant linéaire, la fluidité vient de la
   * densité d'échantillonnage (`def.samples`). On génère `samples + 1` frames
   * (bornes incluses) : pour un cycle, la dernière rejoint exactement la
   * première, ce qui fait boucler la lecture sans plateau final.
   *
   * Remplace les keyframes existantes — l'appelant prévient l'utilisateur.
   */
  loadAnimation(def: AnimationDef): void {
    const ctx = { scale: this.viewScale || 1, anchors: this.anchors }
    const frames: Keyframe[] = []
    for (let i = 0; i <= def.samples; i++) {
      const u = i / def.samples
      frames.push({
        id: this.nextId++,
        time: Math.round(u * def.duration * 1000) / 1000,
        pose: def.sample(u, ctx),
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
    this.duration = def.duration
    this.loop = def.loop
    this.playing = false
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
      }
    }
    this.currentTime = t
    this.sampleInto(this.pose, t)
  }

  sampleInto(out: Pose, t: number): void {
    const kfs = this.keyframes
    if (kfs.length === 0) return
    if (t <= kfs[0].time) return this.assign(out, kfs[0].pose)
    const last = kfs[kfs.length - 1]
    if (t >= last.time) return this.assign(out, last.pose)
    for (let i = 0; i < kfs.length - 1; i++) {
      const a = kfs[i]
      const b = kfs[i + 1]
      if (t >= a.time && t <= b.time) {
        const f = (t - a.time) / (b.time - a.time || 1)
        for (const key in out.targets) {
          const ta = a.pose.targets[key] ?? out.targets[key]
          const tb = b.pose.targets[key] ?? out.targets[key]
          out.targets[key] = { x: lerp(ta.x, tb.x, f), y: lerp(ta.y, tb.y, f) }
        }
        out.bodyX = lerp(a.pose.bodyX, b.pose.bodyX, f)
        out.bodyY = lerp(a.pose.bodyY, b.pose.bodyY, f)
        out.bodyRot = lerp(a.pose.bodyRot, b.pose.bodyRot, f)
        out.gazeX = lerp(a.pose.gazeX, b.pose.gazeX, f)
        out.gazeY = lerp(a.pose.gazeY, b.pose.gazeY, f)
        return
      }
    }
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

  toJSON(): string {
    return JSON.stringify(
      {
        anchors: this.anchors,
        duration: this.duration,
        keyframes: this.keyframes.map((k) => ({ time: k.time, pose: k.pose })),
      },
      null,
      2,
    )
  }
}

export const rigStore = new RigStore()

// Exposition pour inspection / tests en développement.
if (import.meta.env.DEV) {
  ;(window as unknown as { __rig?: RigStore }).__rig = rigStore
}
