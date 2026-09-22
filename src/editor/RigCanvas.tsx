import { useEffect, useRef } from 'react'
import {
  Application,
  Assets,
  Container,
  Graphics,
  Point,
  Sprite,
  type FederatedPointerEvent,
  type Texture,
} from 'pixi.js'
import {
  BODY_URL,
  CHAR_CX,
  CHAR_CY,
  CHAR_H,
  CHAR_W,
  EYES,
  EYE_MID,
  EYE_URL,
  LIMBS,
  LIMB_WIDTH,
  PUPIL_R,
  PUPIL_SVG_R,
  PUPIL_URL,
  segLength,
} from '../rig/rigData'
import { rigStore, type Vec } from './rigStore'
import { onThemeChange, tokenCss, tokenHex } from '../ui/theme'

type HandleType = 'tip' | 'anchor' | 'body-move' | 'body-rot' | 'gaze'

interface Handle {
  id: string
  type: HandleType
  key?: string
  gfx: Graphics
}

interface DragState {
  handle: Handle
  last: Point
  grabOffset: number
}

/**
 * Couleurs des poignées, tirées des tokens du DS (`index.css`) plutôt que
 * codées en dur : elles suivent donc la bascule clair/sombre comme le reste de
 * l'éditeur. Relues à chaque changement de thème (cf. `onThemeChange` plus bas).
 */
function readHandleColors() {
  return {
    /** Extrémité (main / pied) — l'accent de l'app. */
    tip: tokenHex('action'),
    /** Membre sélectionné — le jaune de marque, seul jaune de la scène. */
    selected: tokenHex('star'),
    /** Point d'attache (mode Rigger) — rose de marque, jamais confondu avec `action`. */
    anchor: tokenHex('resurface'),
    /** Corps (déplacement / rotation). */
    body: tokenHex('lavender'),
    /** Regard. */
    gaze: tokenHex('sage'),
    /** Liseré des poignées : l'encre sombre du DS. */
    outline: tokenHex('ink'),
  }
}

/**
 * Chrome flottant de la scène, en pixels écran : l'indice en haut, la capsule
 * d'outils en bas. Le personnage est cadré **entre les deux** — sinon il passe
 * sous la capsule, ou sa poignée de rotation sort par le haut. C'est du cadrage
 * pur : la pose n'est pas touchée.
 */
/** Air laissé entre le personnage et un élément flottant. */
const SCENE_GAP = 12

/**
 * Place occupée par le chrome flottant de la scène — l'indice en haut, la
 * capsule d'outils en bas.
 *
 * Elle est **mesurée**, pas devinée : ces éléments changent de taille avec le
 * cadre (l'indice disparaît sous `lg`, la capsule perd ses libellés sous `md`),
 * et l'éditeur est fait pour vivre dans une iframe de n'importe quelle taille.
 * Des constantes en dur écrasaient le personnage dès que le cadre se resserrait.
 */
function measureInsets(host: HTMLElement) {
  const scene = host.parentElement
  if (!scene) return { top: SCENE_GAP, bottom: SCENE_GAP }
  const rect = scene.getBoundingClientRect()
  const read = (edge: 'top' | 'bottom') => {
    const el = scene.querySelector<HTMLElement>(`[data-scene-inset="${edge}"]`)
    if (!el || el.offsetParent === null) return SCENE_GAP
    const box = el.getBoundingClientRect()
    const size = edge === 'top' ? box.bottom - rect.top : rect.bottom - box.top
    return size + SCENE_GAP
  }
  return { top: read('top'), bottom: read('bottom') }
}

/** Assombrissement des membres passant derrière le corps (voir `depthSort`). */
const FAR_SHADE = 0.62

/** Paires de membres dont la profondeur s'oppose, par mode de tri. */
const ARM_PAIR: [string, string] = ['arm-left', 'arm-right']
const LEG_PAIR: [string, string] = ['leg-left', 'leg-right']

function shade(color: number, f: number): number {
  const r = Math.round(((color >> 16) & 0xff) * f)
  const g = Math.round(((color >> 8) & 0xff) * f)
  const b = Math.round((color & 0xff) * f)
  return (r << 16) | (g << 8) | b
}

/**
 * Résolution IK à 2 os (segments égaux de longueur L) : place le genou/coude K
 * entre l'attache A et l'extrémité T. Si T est hors de portée, il est ramené sur
 * le cercle de portée (membre tendu). Plus T se rapproche de A, plus ça plie.
 */
function solveIK(
  A: Vec,
  T: Vec,
  L: number,
  bend: number,
  curve: number,
  bendRad: number,
  stretch: boolean,
) {
  let dx = T.x - A.x
  let dy = T.y - A.y
  let d = Math.hypot(dx, dy)
  const maxD = 2 * L
  if (d < 1e-3) {
    dx = 0
    dy = 1
    d = 1e-3
  }
  const ux = dx / d
  const uy = dy / d
  // Sans étirement : la portée est bornée (membre rigide). Avec : il s'allonge.
  const dc = stretch ? d : Math.min(d, maxD)
  const Tx = A.x + ux * dc
  const Ty = A.y + uy * dc
  // hauteur du bombement, modulée par la « rondeur »
  const h = Math.sqrt(Math.max(0, L * L - (dc / 2) * (dc / 2))) * curve
  const mx = A.x + ux * (dc / 2)
  const my = A.y + uy * (dc / 2)
  // perpendiculaire à A→T, tournée par « rotation du pli »
  let px = -uy
  let py = ux
  if (bendRad !== 0) {
    const c = Math.cos(bendRad)
    const s = Math.sin(bendRad)
    const rx = px * c - py * s
    const ry = px * s + py * c
    px = rx
    py = ry
  }
  return {
    K: { x: mx + px * h * bend, y: my + py * h * bend },
    T: { x: Tx, y: Ty },
  }
}

export function RigCanvas() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const app = new Application()
    let destroyed = false
    let ro: ResizeObserver | null = null

    let colors = readHandleColors()
    const ready = app.init({
      // Fond de scène = le « ciel » de l'accueil iOS (token `stage`).
      background: tokenCss('stage'),
      // Pas de `resizeTo` : il n'écoute que le redimensionnement de la
      // **fenêtre**. La scène, elle, change aussi de largeur quand on replie le
      // panneau — le canvas restait alors à son ancienne taille (fond tronqué,
      // personnage décentré). C'est le `ResizeObserver` du layout qui
      // redimensionne le renderer, une seule voie pour les deux cas.
      width: host.clientWidth,
      height: host.clientHeight,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    })

    ready
      .then(async () => {
        if (destroyed) return
        const [bodyTex, eyeTex, pupilTex]: Texture[] = await Promise.all([
          Assets.load({ src: BODY_URL, data: { resolution: 3 } }),
          Assets.load({ src: EYE_URL, data: { resolution: 3 } }),
          Assets.load({ src: PUPIL_URL, data: { resolution: 3 } }),
        ])
        if (destroyed) return
        host.appendChild(app.canvas)

        // --- Personnage ---
        const character = new Container()
        character.pivot.set(CHAR_CX, CHAR_CY)
        app.stage.addChild(character)

        // Membres procéduraux. Par défaut tous DERRIÈRE le corps ; quand une
        // paire est triée par profondeur, celui qui est en avant est reparenté
        // dans `frontLimbs`.
        const backLimbs = new Container()
        character.addChild(backLimbs)

        const limbGfx: Record<string, Graphics> = {}
        for (const l of LIMBS) {
          const g = new Graphics()
          backLimbs.addChild(g)
          limbGfx[l.key] = g
        }

        const body = new Sprite(bodyTex)
        character.addChild(body)

        // Au-dessus du corps mais sous le visage : un bras qui passe devant le
        // torse ne doit pas recouvrir les yeux.
        const frontLimbs = new Container()
        character.addChild(frontLimbs)

        // Blancs des yeux (statiques, asset Oeil.svg) au-dessus du corps.
        for (const eye of EYES) {
          const w = new Sprite(eyeTex)
          w.anchor.set(0.5)
          w.position.set(eye.cx, eye.cy)
          character.addChild(w)
        }

        // Pupilles mobiles, par-dessus les blancs.
        const pupilScale = PUPIL_R / PUPIL_SVG_R
        const pupils = EYES.map(() => {
          const p = new Sprite(pupilTex)
          p.anchor.set(0.5)
          p.scale.set(pupilScale)
          character.addChild(p)
          return p
        })

        // --- Poignées (coords écran, taille constante) ---
        const handleLayer = new Container()
        app.stage.addChild(handleLayer)

        let drag: DragState | null = null
        const handles: Handle[] = []
        const addHandle = (id: string, type: HandleType, key?: string) => {
          const gfx = new Graphics()
          gfx.eventMode = 'static'
          gfx.cursor = 'grab'
          handleLayer.addChild(gfx)
          const h: Handle = { id, type, key, gfx }
          handles.push(h)
          gfx.on('pointerdown', (e: FederatedPointerEvent) => {
            e.stopPropagation()
            drag = { handle: h, last: e.global.clone(), grabOffset: grabOffsetFor(h, e.global) }
            rigStore.select(key ?? null)
          })
          return h
        }
        LIMBS.forEach((l) => addHandle(`tip-${l.key}`, 'tip', l.key))
        LIMBS.forEach((l) => addHandle(`anchor-${l.key}`, 'anchor', l.key))
        addHandle('body-move', 'body-move')
        addHandle('body-rot', 'body-rot')
        addHandle('gaze', 'gaze')

        function grabOffsetFor(h: Handle, g: Point): number {
          if (h.type === 'body-rot') {
            const raw = Math.atan2(g.y - character.y, g.x - character.x)
            return rigStore.pose.bodyRot - raw
          }
          return 0
        }

        // --- Drag global ---
        app.stage.eventMode = 'static'
        app.stage.hitArea = app.screen
        app.stage.on('pointerdown', () => rigStore.select(null))
        app.stage.on('pointermove', (e: FederatedPointerEvent) => {
          if (!drag) return
          const { handle } = drag
          const local = character.toLocal(e.global)
          if (handle.type === 'tip' && handle.key) {
            rigStore.setTarget(handle.key, local.x, local.y)
          } else if (handle.type === 'anchor' && handle.key) {
            rigStore.setAnchor(handle.key, local.x, local.y)
          } else if (handle.type === 'body-move') {
            rigStore.nudgeBody(e.global.x - drag.last.x, e.global.y - drag.last.y)
            drag.last = e.global.clone()
          } else if (handle.type === 'body-rot') {
            const raw = Math.atan2(e.global.y - character.y, e.global.x - character.x)
            rigStore.setBodyRot(raw + drag.grabOffset)
          } else if (handle.type === 'gaze') {
            rigStore.setGaze(local.x - EYE_MID.x, local.y - EYE_MID.y)
          }
        })
        // Suivi du curseur (quand activé et qu'on ne drague pas une poignée).
        app.stage.on('globalpointermove', (e: FederatedPointerEvent) => {
          if (!rigStore.followGaze || drag) return
          const local = character.toLocal(e.global)
          rigStore.setGaze(local.x - EYE_MID.x, local.y - EYE_MID.y)
        })
        app.stage.on('pointerup', () => (drag = null))
        app.stage.on('pointerupoutside', () => (drag = null))

        // --- Layout ---
        let scale = 1
        /** Centre de la zone laissée libre par le chrome flottant. */
        let centerY = 0
        const layout = () => {
          if (host.clientWidth > 0 && host.clientHeight > 0) {
            app.renderer.resize(host.clientWidth, host.clientHeight)
          }
          const inset = measureInsets(host)
          const usable = Math.max(app.screen.height - inset.top - inset.bottom, 80)
          centerY = inset.top + usable / 2
          scale = Math.min((app.screen.width * 0.62) / CHAR_W, (usable * 0.92) / CHAR_H)
          character.scale.set(scale)
          rigStore.viewScale = scale
        }
        layout()
        ro = new ResizeObserver(() => layout())
        ro.observe(host)
        host.parentElement
          ?.querySelectorAll<HTMLElement>('[data-scene-inset]')
          .forEach((el) => ro?.observe(el))

        if (import.meta.env.DEV) {
          ;(window as unknown as { __rigDebug?: unknown }).__rigDebug = {
            tipClient(key: string) {
              const t = rigStore.pose.targets[key]
              const g = character.toGlobal(new Point(t.x, t.y))
              const r = app.canvas.getBoundingClientRect()
              return { x: r.left + g.x, y: r.top + g.y }
            },
          }
        }

        const drawHandle = (gfx: Graphics, color: number, r: number, ring = false) => {
          gfx.clear()
          if (ring) gfx.circle(0, 0, r).stroke({ width: 2.5, color, alpha: 0.9 })
          else
            gfx
              .circle(0, 0, r)
              .fill({ color, alpha: 0.95 })
              .stroke({ width: 2, color: colors.outline, alpha: 0.8 })
        }

        // --- Boucle : lecture, IK des membres, poignées ---
        app.ticker.add((ticker) => {
          const dt = Math.min(ticker.deltaMS / 1000, 1 / 30)
          rigStore.tick(dt)

          const pose = rigStore.pose
          character.position.set(app.screen.width / 2 + pose.bodyX, centerY + pose.bodyY)
          character.rotation = pose.bodyRot

          // Pupilles (regard partagé par les 2 yeux).
          for (let i = 0; i < pupils.length; i++) {
            pupils[i].position.set(EYES[i].cx + pose.gazeX, EYES[i].cy + pose.gazeY)
          }

          // Profondeur : dans chaque paire triée, le membre dont l'extrémité
          // est la plus en avant passe devant le corps ; l'autre reste derrière
          // et est assombri. C'est ce qui rend le croisement des jambes lisible
          // — sans ça, deux capsules identiques se confondent. Les paires non
          // triées restent toutes les deux derrière, à pleine couleur.
          const sort = rigStore.depthSort
          const sorted: Record<string, boolean> = {}
          const isNear: Record<string, boolean> = {}
          const pairs = sort === 'all' ? [ARM_PAIR, LEG_PAIR] : sort === 'legs' ? [LEG_PAIR] : []
          for (const [a, b] of pairs) {
            const near = pose.targets[a].x >= pose.targets[b].x
            isNear[a] = near
            isNear[b] = !near
            sorted[a] = true
            sorted[b] = true
          }

          // Membres : IK 2 os + capsule à jointure arrondie.
          for (const l of LIMBS) {
            const A = rigStore.anchors[l.key]
            const T = pose.targets[l.key]
            const style = rigStore.limbStyle[l.key]
            const bendRad = (style.bendDeg * Math.PI) / 180
            const { K, T: Tk } = solveIK(
              A,
              T,
              segLength(l),
              l.bend,
              style.curve,
              bendRad,
              style.stretch,
            )
            // Courbe lisse sur TOUTE la longueur (pas de coude) : Bézier
            // quadratique dont le point de contrôle est placé pour que le milieu
            // de la courbe passe par le « genou » K → le membre entier se bombe.
            const mx = (A.x + Tk.x) / 2
            const my = (A.y + Tk.y) / 2
            const cx = 2 * K.x - mx
            const cy = 2 * K.y - my

            const g = limbGfx[l.key]
            const far = sorted[l.key] === true && !isNear[l.key]
            // Reparentage seulement quand la profondeur change (coûteux à faire
            // à chaque frame sinon).
            const layer = sorted[l.key] === true && isNear[l.key] ? frontLimbs : backLimbs
            if (g.parent !== layer) layer.addChild(g)

            g.clear()
              .moveTo(A.x, A.y)
              .quadraticCurveTo(cx, cy, Tk.x, Tk.y)
              .stroke({
                width: LIMB_WIDTH,
                color: far ? shade(l.color, FAR_SHADE) : l.color,
                cap: 'round',
              })
          }

          // Poignées.
          const mode = rigStore.mode
          for (const h of handles) {
            let visible = false
            let lx = 0
            let ly = 0
            if (h.type === 'tip' && mode === 'pose') {
              visible = true
              const t = rigStore.pose.targets[h.key!]
              lx = t.x
              ly = t.y
            } else if (h.type === 'anchor' && mode === 'rig') {
              visible = true
              lx = rigStore.anchors[h.key!].x
              ly = rigStore.anchors[h.key!].y
            } else if (h.type === 'body-move' && mode === 'pose') {
              visible = true
              lx = CHAR_CX
              ly = CHAR_CY
            } else if (h.type === 'body-rot' && mode === 'pose') {
              visible = true
              lx = CHAR_CX
              ly = -18
            } else if (h.type === 'gaze' && mode === 'pose' && !rigStore.followGaze) {
              visible = true
              lx = EYE_MID.x + rigStore.pose.gazeX
              ly = EYE_MID.y + rigStore.pose.gazeY
            }
            h.gfx.visible = visible
            if (!visible) continue
            const g = character.toGlobal(new Point(lx, ly))
            h.gfx.position.set(g.x, g.y)
            const isSel = h.key && rigStore.selected === h.key
            if (h.type === 'tip') drawHandle(h.gfx, isSel ? colors.selected : colors.tip, isSel ? 11 : 9)
            else if (h.type === 'anchor')
              drawHandle(h.gfx, isSel ? colors.selected : colors.anchor, isSel ? 11 : 9)
            else if (h.type === 'body-move') drawHandle(h.gfx, colors.body, 10, true)
            else if (h.type === 'body-rot') drawHandle(h.gfx, colors.body, 7)
            else if (h.type === 'gaze') drawHandle(h.gfx, colors.gaze, 8, true)
          }
        })
      })
      .catch((err) => console.error('[Mynd] échec du montage de l’éditeur', err))

    // Bascule de thème : fond de scène et poignées relus (les Graphics sont
    // redessinés à la frame suivante par le ticker).
    const offTheme = onThemeChange(() => {
      colors = readHandleColors()
      ready.then(() => {
        if (!destroyed) app.renderer.background.color = tokenCss('stage')
      }).catch(() => {})
    })

    return () => {
      destroyed = true
      offTheme()
      ro?.disconnect()
      ready.then(() => app.destroy(true, { children: true })).catch(() => {})
    }
  }, [])

  // `touch-none` : dans une page hôte, un doigt posé sur la scène pose le
  // personnage — il ne fait pas défiler la page qui embarque l'éditeur.
  return <div ref={hostRef} className="absolute inset-0 touch-none" />
}
