import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

/**
 * Copie **à plat** du `UISlider` d'iOS 26 : même géométrie, mêmes ressorts, même
 * inertie, même élastique en bout de course — sans la lentille Liquid Glass (le
 * pouce est un aplat blanc).
 *
 * Toutes les constantes viennent de **mesures image par image** du slider natif
 * (simulateur iOS 26.4, `CADisplayLink` sur les calques de présentation + position
 * réelle du doigt, ressorts ajustés aux moindres carrés) :
 *
 * - **appui** — le pouce 37 × 24 passe à ×1,551 depuis son centre, ressort
 *   ζ 0,555 / réponse 0,222 s (pic ×1,62 à 0,14 s) ;
 * - **relâche** — retour à ×1, ζ 0,70 / réponse 0,49 s (creux ×0,974 à 0,34 s) ;
 * - **glissé** — seuil de 10 px avant de partir, le pouce avance à
 *   `(largeur − 37) / largeur` de la vitesse du doigt et le suit par un lissage
 *   exponentiel k = 11,5 s⁻¹ ;
 * - **lancer** — au lâcher, la cible avance de `v / k` : le même lissage continue,
 *   la vitesse du doigt passe au pouce sans rupture ;
 * - **déformation** — réaction à l'**accélération** (filtre linéaire identifié sur
 *   le natif, noyau `KERNEL` à 60 Hz) : élargi/aplati en accélérant vers la droite,
 *   affiné/rehaussé vers la gauche, puis rebond inverse ;
 * - **bout de course** — élastique saturant `x·d·c / (d + c·x)` (d 10,4, c 0,55) ;
 *   la piste est tirée (bord côté butée 100 %, bord opposé 36 %) et s'amincit.
 *
 * Ajout par rapport à iOS : un **clic sur la piste** y envoie le pouce (avec les
 * mêmes ressorts), puis enchaîne sur un glissé sans seuil.
 *
 * Tout le mouvement est calculé dans une boucle `requestAnimationFrame` qui écrit
 * directement les styles : aucun rendu React par image. Le composant est
 * **contrôlé** : il renvoie la valeur via `onChange` et suit `value` quand elle
 * change de l'extérieur — ce trajet-là n'émet rien, sinon chaque valeur
 * intermédiaire du glissement repartirait dans le store (un preset chargé
 * serait réécrit par son propre curseur).
 *
 * Couleurs par défaut : les tokens du DS (piste au lavis `panel-row`, part
 * réglée en `action`), qui suivent la bascule `data-theme` — ce que la variante
 * `dark:` de Tailwind, calée sur le seul réglage système, ne ferait pas. Le
 * pouce reste blanc absolu dans les deux thèmes, comme sur iOS. Le focus est
 * l'anneau global de `index.css`.
 */

// --- Constantes mesurées sur le UISlider natif --------------------------------
const THUMB_W = 37
const THUMB_H = 24
const HEIGHT = 44 // zone tactile (HIG)
const CY = HEIGHT / 2
const TRACK_H = 6
const PRESS = { scale: 1.5513, zeta: 0.555, response: 0.222 }
const RELEASE = { zeta: 0.7, response: 0.49 }
const K = 11.5 // lissage du suivi (s⁻¹)
const DEAD_ZONE = 10 // px avant que le pouce attrapé parte
const RUBBER_D = 10.4
const RUBBER_C = 0.55
const TRAIL = 0.36 // part du dépassement que suit le bord opposé de la piste
const THIN = 0.29 // amincissement de la piste par px de dépassement
const SUBSTEP = 1 / 240
const SAMPLE = 1 / 60 // pas du noyau de déformation
/** Réponse de l'étirement à une impulsion de vitesse (px/s), identifiée à 60 Hz. */
const KERNEL = [
  -2.297e-6, 6.785e-8, 3.748e-6, 1.013e-5, 1.569e-5, 2.408e-5, 2.825e-5, 3.258e-5, 3.247e-5,
  3.064e-5, 2.511e-5, 1.943e-5, 1.141e-5, 3.681e-6, -2.805e-6, -1.037e-5, -1.466e-5, -2.046e-5,
  -2.333e-5, -2.448e-5, -2.283e-5, -1.659e-5, -1.924e-5, -1.838e-5, -1.672e-5, -1.448e-5,
  -1.259e-5, -9.82e-6, -7.825e-6, -5.841e-6, -4.057e-6, -2.541e-6, -1.576e-6, -3.584e-7, 6.062e-7,
  1.019e-6, 1.598e-6, 1.502e-6, 1.891e-6, 1.893e-6, 1.38e-6, 1.53e-6, 1.488e-6, 8.073e-7, 1.242e-6,
]
const NK = KERNEL.length

/** État physique, en px (centre du pouce, non borné pendant l'élastique). */
type Physics = {
  width: number
  target: number
  pos: number
  scale: number
  scaleVel: number
  scaleTarget: number
  pressed: boolean
  moving: boolean
  deadSign: number
  x0: number
  target0: number
  history: Array<[t: number, x: number]>
  velocities: Float64Array
  vIndex: number
  acc: number
  lastDisplay: number
  stretchPrev: number
  stretch: number
  raf: number
  lastFrame: number
  emitted: number
  interacted: boolean
}

const lo = () => THUMB_W / 2
const hi = (p: Physics) => p.width - THUMB_W / 2
const travel = (p: Physics) => Math.max(1, p.width - THUMB_W)
const clampPos = (p: Physics, c: number) => Math.min(hi(p), Math.max(lo(), c))
const rubber = (o: number) => {
  const a = Math.abs(o)
  return (Math.sign(o) * (a * RUBBER_D * RUBBER_C)) / (RUBBER_D + RUBBER_C * a)
}
const displayPos = (p: Physics) => {
  const c = clampPos(p, p.pos)
  return c + rubber(p.pos - c)
}

export type FluidSliderClassNames = {
  /** Piste (fond). Défaut : lavis `panel-row`. */
  track?: string
  /** Partie réglée. Défaut : `action`. */
  fill?: string
  /** Pouce. Défaut : blanc et liseré fin. */
  thumb?: string
}

export function FluidSlider({
  value,
  onChange,
  onChangeEnd,
  min = 0,
  max = 1,
  step,
  label,
  disabled = false,
  className = '',
  classNames = {},
}: {
  value: number
  onChange: (value: number) => void
  /** Appelé une fois le mouvement fini (relâche, élan et retour d'élastique compris). */
  onChangeEnd?: (value: number) => void
  min?: number
  max?: number
  /** Arrondit la valeur émise ; le mouvement, lui, reste continu comme sur iOS. */
  step?: number
  /** Nom accessible du curseur. */
  label: string
  disabled?: boolean
  /** Classes du conteneur (largeur notamment : il remplit son parent par défaut). */
  className?: string
  classNames?: FluidSliderClassNames
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)

  const phys = useRef<Physics>({
    width: 300,
    target: 0,
    pos: 0,
    scale: 1,
    scaleVel: 0,
    scaleTarget: 1,
    pressed: false,
    moving: false,
    deadSign: 0,
    x0: 0,
    target0: 0,
    history: [],
    velocities: new Float64Array(NK),
    vIndex: 0,
    acc: 0,
    lastDisplay: 0,
    stretchPrev: 0,
    stretch: 0,
    raf: 0,
    lastFrame: 0,
    emitted: value,
    interacted: false,
  })

  // Les rappels et bornes changent d'un rendu à l'autre ; la boucle lit toujours
  // la dernière version sans devoir être recréée.
  const latest = useRef({ onChange, onChangeEnd, min, max, step })
  latest.current = { onChange, onChangeEnd, min, max, step }

  const reduceMotion = useRef(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => (reduceMotion.current = mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const toPos = useCallback((v: number) => {
    const { min, max } = latest.current
    const t = max > min ? (Math.min(max, Math.max(min, v)) - min) / (max - min) : 0
    return lo() + t * travel(phys.current)
  }, [])

  const render = useCallback(() => {
    const p = phys.current
    const track = trackRef.current
    const fill = fillRef.current
    const thumb = thumbRef.current
    if (!track || !fill || !thumb) return

    const c = clampPos(p, p.pos)
    const d = displayPos(p)
    const r = d - c

    // Pouce : échelle d'appui × étirement lié à l'accélération.
    let s = p.stretchPrev + (p.stretch - p.stretchPrev) * Math.min(1, p.acc / SAMPLE)
    s = reduceMotion.current ? 0 : 0.2 * Math.tanh(s / 0.2)
    const w = THUMB_W * p.scale * (1 + s)
    const h = THUMB_H * p.scale * (1 - s)
    thumb.style.width = `${w}px`
    thumb.style.height = `${h}px`
    thumb.style.borderRadius = `${h / 2}px`
    thumb.style.transform = `translate3d(${d - w / 2}px, ${CY - h / 2}px, 0)`

    // Piste tirée par l'élastique.
    const left = r >= 0 ? TRAIL * r : r
    const right = r >= 0 ? p.width + r : p.width + TRAIL * r
    const th = Math.max(2, TRACK_H - THIN * Math.abs(r))
    track.style.width = `${right - left}px`
    track.style.height = `${th}px`
    track.style.borderRadius = `${th / 2}px`
    track.style.transform = `translate3d(${left}px, ${CY - th / 2}px, 0)`

    // Le remplissage s'arrête au centre du pouce, et rentre dessous aux extrémités.
    const t = (c - lo()) / travel(p)
    const tuck = (u: number) => Math.exp(-u / 0.013)
    const fillEnd = d - (THUMB_W / 2) * tuck(t) + (THUMB_W / 2) * tuck(1 - t)
    fill.style.width = `${Math.max(0, Math.min(right, fillEnd) - left)}px`

    // Valeur émise — seulement quand c'est l'utilisateur qui fait bouger le pouce.
    if (!p.interacted) return
    const { min, max, step, onChange } = latest.current
    let v = min + t * (max - min)
    if (step) v = Math.min(max, Math.max(min, min + Math.round((v - min) / step) * step))
    if (v !== p.emitted) {
      p.emitted = v
      onChange(v)
    }
  }, [])

  const substep = useCallback((dt: number) => {
    const p = phys.current
    p.pos += (p.target - p.pos) * (1 - Math.exp(-K * dt))

    const spring = p.scaleTarget > 1 ? PRESS : RELEASE
    const zeta = reduceMotion.current ? 1 : spring.zeta
    const omega = (2 * Math.PI) / spring.response
    p.scaleVel += (-omega * omega * (p.scale - p.scaleTarget) - 2 * zeta * omega * p.scaleVel) * dt
    p.scale += p.scaleVel * dt

    p.acc += dt
    while (p.acc >= SAMPLE) {
      p.acc -= SAMPLE
      const d = displayPos(p)
      p.velocities[p.vIndex] = (d - p.lastDisplay) / SAMPLE
      p.lastDisplay = d
      let s = 0
      for (let i = 0; i < NK; i++) s += KERNEL[i] * p.velocities[(p.vIndex - i + NK) % NK]
      p.vIndex = (p.vIndex + 1) % NK
      p.stretchPrev = p.stretch
      p.stretch = s
    }
  }, [])

  const isSettled = () => {
    const p = phys.current
    if (p.pressed) return false
    if (Math.abs(p.target - p.pos) > 0.02) return false
    if (Math.abs(p.scale - p.scaleTarget) > 5e-4 || Math.abs(p.scaleVel) > 1e-3) return false
    if (Math.abs(p.stretch) > 3e-4) return false
    return p.velocities.every((v) => Math.abs(v) < 0.3)
  }

  const frame = useCallback(
    (now: number) => {
      const p = phys.current
      const dt = Math.min(0.05, Math.max(0, (now - p.lastFrame) / 1000))
      p.lastFrame = now
      const n = Math.max(1, Math.ceil(dt / SUBSTEP))
      for (let i = 0; i < n; i++) substep(dt / n)
      render()

      if (isSettled()) {
        p.pos = p.target
        p.scale = p.scaleTarget
        p.scaleVel = 0
        p.velocities.fill(0)
        p.stretch = p.stretchPrev = 0
        p.lastDisplay = displayPos(p)
        render()
        p.raf = 0
        if (p.interacted) {
          p.interacted = false
          latest.current.onChangeEnd?.(p.emitted)
        }
        return
      }
      p.raf = requestAnimationFrame(frame)
    },
    [render, substep],
  )

  const wake = useCallback(() => {
    const p = phys.current
    if (p.raf) return
    p.lastFrame = performance.now()
    p.raf = requestAnimationFrame(frame)
  }, [frame])

  useEffect(() => () => cancelAnimationFrame(phys.current.raf), [])

  // Largeur : le curseur remplit son conteneur ; la valeur est conservée au redimensionnement.
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const p = phys.current
    let first = true
    const apply = (width: number) => {
      // 1ʳᵉ mesure : on part de `value` ; ensuite on conserve la position relative.
      const t = first ? null : (clampPos(p, p.pos) - lo()) / travel(p)
      first = false
      p.width = Math.max(THUMB_W + 1, width)
      p.pos = p.target = t === null ? toPos(value) : lo() + t * travel(p)
      p.lastDisplay = displayPos(p)
      render()
    }
    apply(root.clientWidth)
    const ro = new ResizeObserver(([entry]) => apply(entry.contentRect.width))
    ro.observe(root)
    return () => ro.disconnect()
    // `value` volontairement absent : seule la valeur initiale compte ici, les
    // changements passent par l'effet suivant.
  }, [render, toPos])

  // Valeur changée de l'extérieur : le pouce s'y rend avec le même lissage.
  useEffect(() => {
    const p = phys.current
    if (p.pressed || value === p.emitted) return
    p.emitted = value
    p.target = toPos(value)
    wake()
  }, [value, min, max, toPos, wake])

  // --- Pointeur --------------------------------------------------------------
  const localPoint = (e: React.PointerEvent) => {
    const rect = rootRef.current!.getBoundingClientRect()
    const k = rect.width / phys.current.width || 1
    return [(e.clientX - rect.left) / k, (e.clientY - rect.top) / k] as const
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return
    const p = phys.current
    const [x, y] = localPoint(e)
    if (Math.abs(y - CY) > CY + 8) return
    e.currentTarget.setPointerCapture(e.pointerId)
    // Pas de `focus()` ni de `preventDefault()` : le clic natif donne le focus
    // sans allumer l'anneau clavier, qu'un focus programmatique allumerait.
    // Défilement et sélection sont déjà coupés par `touch-none select-none`.

    const d = displayPos(p)
    const grabbed = Math.abs(x - d) <= Math.max((THUMB_W * p.scale) / 2, 22) + 4
    p.pressed = true
    p.interacted = true
    p.scaleTarget = PRESS.scale
    p.history = [[e.timeStamp / 1000, x]]
    p.x0 = x
    if (grabbed) {
      // Pouce attrapé : comportement UIKit, seuil avant de partir.
      p.moving = false
      p.target0 = p.target = clampPos(p, p.pos)
    } else {
      // Clic sur la piste : le pouce y file, puis suit le glissé sans seuil.
      p.moving = true
      p.deadSign = 0
      p.target0 = p.target = clampPos(p, x)
    }
    wake()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = phys.current
    if (!p.pressed) return
    const events = e.nativeEvent.getCoalescedEvents?.() ?? []
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const rect = rootRef.current!.getBoundingClientRect()
      const k = rect.width / p.width || 1
      const x = (ev.clientX - rect.left) / k
      const t = ev.timeStamp / 1000
      const dx = x - p.x0
      if (!p.moving) {
        if (Math.abs(dx) < DEAD_ZONE) continue
        p.moving = true
        p.deadSign = Math.sign(dx)
      }
      p.target = p.target0 + (dx - p.deadSign * DEAD_ZONE) * (travel(p) / p.width)
      p.history.push([t, x])
      while (p.history.length > 2 && p.history[0][0] < t - 0.15) p.history.shift()
    }
    wake()
  }

  const releaseVelocity = (now: number) => {
    const p = phys.current
    const h = p.history
    if (!p.moving || h.length < 2) return 0
    const last = h[h.length - 1]
    if (now - last[0] > 0.05) return 0 // doigt immobile avant de lâcher : pas d'élan
    let i = h.length - 1
    while (i > 0 && h[i - 1][0] >= last[0] - 0.08) i--
    const dt = last[0] - h[i][0]
    return dt > 0 ? ((last[1] - h[i][1]) / dt) * (travel(p) / p.width) : 0
  }

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = phys.current
    if (!p.pressed) return
    const v = releaseVelocity(e.timeStamp / 1000)
    p.pressed = false
    p.scaleTarget = 1
    p.target = clampPos(p, clampPos(p, p.target) + v / K)
    wake()
  }

  // --- Clavier ---------------------------------------------------------------
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const p = phys.current
    const { min, max, step } = latest.current
    const unit = (step ?? (max - min) / 20) / (max - min || 1)
    const deltas: Record<string, number> = {
      ArrowRight: unit, ArrowUp: unit, ArrowLeft: -unit, ArrowDown: -unit,
      PageUp: unit * 5, PageDown: -unit * 5,
    }
    let next: number | null = null
    if (e.key in deltas) next = clampPos(p, clampPos(p, p.target) + deltas[e.key] * travel(p))
    else if (e.key === 'Home') next = lo()
    else if (e.key === 'End') next = hi(p)
    if (next === null) return
    e.preventDefault()
    p.target = next
    p.interacted = true
    wake()
  }

  return (
    <div
      ref={rootRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-disabled={disabled || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
      className={`relative h-11 w-full cursor-pointer touch-none select-none rounded-xl ${disabled ? 'pointer-events-none opacity-40' : ''} ${className}`}
    >
      <div
        ref={trackRef}
        className={`absolute top-0 left-0 overflow-hidden will-change-transform ${classNames.track ?? 'bg-panel-row'}`}
      >
        <div
          ref={fillRef}
          className={`absolute inset-y-0 left-0 ${classNames.fill ?? 'bg-action'}`}
        />
      </div>
      <div
        ref={thumbRef}
        className={`absolute top-0 left-0 will-change-transform ${classNames.thumb ?? 'bg-white shadow-[0_0_0_0.5px_rgb(20_24_36/0.16)]'}`}
      />
    </div>
  )
}
