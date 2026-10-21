import { useCallback, useEffect, useRef, useState } from 'react'
import { useRig } from './useRig'
import { FPS, rigStore, snapToFrame } from './rigStore'
import { INTERP_META, KeyGlyph, TrackContextMenu, type ContextMenuState } from './KeyframeMenus'

/** Distance (px) en dessous de laquelle un appui reste un clic, pas un glissé. */
const DRAG_THRESHOLD = 4
/** Appui long au doigt = clic droit. */
const LONG_PRESS_MS = 500
/** Espace minimal entre deux graduations principales de la règle. */
const MIN_MAJOR_PX = 56
/**
 * Pas possibles de la règle. Des secondes rondes, pas des multiples d'image :
 * « 0.08s, 0.17s » ne se lit pas. La grille d'images, elle, est tracée en fond.
 */
const MAJOR_STEPS = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 30]
/** Largeur de la zone qui fait défiler la piste zoomée pendant un glissé. */
const EDGE_SCROLL_PX = 28

type Gesture =
  | {
      kind: 'key'
      id: number
      startX: number
      /** écart pointeur → keyframe, pour qu'elle ne saute pas sous le doigt. */
      grab: number
      alt: boolean
      additive: boolean
      moved: boolean
      consumed: boolean
    }
  | { kind: 'lane'; startX: number; base: Set<number>; additive: boolean; moved: boolean; consumed: boolean }
  | { kind: 'ruler' }

function formatTime(t: number): string {
  return `${t.toFixed(2)}s`
}

/**
 * La piste de la timeline : une **règle** en haut (on y fait défiler le temps)
 * et le **couloir des keyframes** dessous (on y sélectionne et on déplace).
 * Séparer les deux gestes est ce qui rend la piste utilisable : sur une piste
 * unique, « glisser » ne peut pas vouloir dire à la fois déplacer le playhead,
 * déplacer une keyframe et sélectionner au lasso.
 *
 * Gestes du couloir :
 * - clic sur une keyframe : la sélectionne et y amène le playhead ;
 *   ⇧ / ⌘ + clic : l'ajoute ou la retire de la sélection ;
 * - glisser une keyframe : déplace toute la sélection, calée sur les images ;
 *   avec Alt : en laisse une copie ;
 * - glisser dans le vide : sélection au lasso (⇧ : ajoute) ;
 *   clic dans le vide : désélectionne et y amène le playhead ;
 * - clic droit / appui long : menu contextuel.
 *
 * Le zoom (⌘ + molette, pincement du trackpad) élargit le contenu ; la piste
 * défile alors horizontalement.
 */
export function TimelineTrack({
  zoom,
  viewportRef,
  contentRef,
  playheadRef,
}: {
  zoom: number
  viewportRef: React.RefObject<HTMLDivElement | null>
  contentRef: React.RefObject<HTMLDivElement | null>
  playheadRef: React.RefObject<HTMLDivElement | null>
}) {
  const rig = useRig()
  const gesture = useRef<Gesture | null>(null)
  const longPress = useRef(0)
  const [width, setWidth] = useState(0)
  const [marquee, setMarquee] = useState<{ a: number; b: number } | null>(null)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [contentRef])

  const duration = rig.duration
  const pxPerSec = width / duration

  /** Instant sous un x écran (non calé). */
  const timeAt = useCallback(
    (clientX: number) => {
      const el = contentRef.current
      if (!el) return 0
      const r = el.getBoundingClientRect()
      return Math.max(0, Math.min(1, (clientX - r.left) / (r.width || 1))) * rigStore.duration
    },
    [contentRef],
  )
  const contentX = (clientX: number) =>
    clientX - (contentRef.current?.getBoundingClientRect().left ?? 0)

  /** Piste zoomée : un glissé qui approche d'un bord la fait défiler. */
  const edgeScroll = (clientX: number) => {
    const vp = viewportRef.current
    if (!vp || zoom <= 1) return
    const r = vp.getBoundingClientRect()
    if (clientX < r.left + EDGE_SCROLL_PX) vp.scrollLeft -= 12
    else if (clientX > r.right - EDGE_SCROLL_PX) vp.scrollLeft += 12
  }

  const cancelLongPress = () => window.clearTimeout(longPress.current)
  const armLongPress = (e: React.PointerEvent, keyId: number | null) => {
    cancelLongPress()
    if (e.pointerType !== 'touch') return
    const { clientX: x, clientY: y } = e
    longPress.current = window.setTimeout(() => {
      const g = gesture.current
      if (!g || g.kind === 'ruler' || g.moved) return
      g.consumed = true
      // Le relâchement du doigt émet un clic à cet endroit : il tomberait sur
      // le menu qui vient de s'ouvrir. On l'avale.
      const swallow = (ev: MouseEvent) => {
        ev.stopPropagation()
        ev.preventDefault()
      }
      window.addEventListener('click', swallow, { capture: true, once: true })
      window.setTimeout(() => window.removeEventListener('click', swallow, true), 800)
      openMenu(x, y, keyId, true)
    }, LONG_PRESS_MS)
  }

  const openMenu = (x: number, y: number, keyId: number | null, touch = false) => {
    // Le menu d'une keyframe agit sur la sélection : on y inclut la keyframe
    // visée, sans défaire une sélection multiple qui la contient déjà.
    if (keyId !== null && !rigStore.keySelection.has(keyId)) rigStore.setKeySelection([keyId])
    setMenu({ x, y, time: timeAt(x), keyId, touch })
  }

  // --- Règle : défiler le temps ---
  const onRulerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    gesture.current = { kind: 'ruler' }
    rig.pause()
    rig.setTime(snapToFrame(timeAt(e.clientX)))
  }
  const onRulerMove = (e: React.PointerEvent) => {
    if (gesture.current?.kind !== 'ruler') return
    edgeScroll(e.clientX)
    rig.setTime(snapToFrame(timeAt(e.clientX)))
  }

  // --- Couloir : lasso, clic dans le vide ---
  const onLaneDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const additive = e.shiftKey || e.metaKey || e.ctrlKey
    gesture.current = {
      kind: 'lane',
      startX: e.clientX,
      base: additive ? new Set(rigStore.keySelection) : new Set(),
      additive,
      moved: false,
      consumed: false,
    }
    armLongPress(e, null)
  }
  const onLaneMove = (e: React.PointerEvent) => {
    const g = gesture.current
    if (g?.kind !== 'lane' || g.consumed) return
    if (!g.moved && Math.abs(e.clientX - g.startX) < DRAG_THRESHOLD) return
    g.moved = true
    cancelLongPress()
    edgeScroll(e.clientX)
    const a = contentX(g.startX)
    const b = contentX(e.clientX)
    setMarquee({ a, b })
    const t0 = timeAt(Math.min(g.startX, e.clientX))
    const t1 = timeAt(Math.max(g.startX, e.clientX))
    const ids = new Set(g.base)
    for (const k of rigStore.keyframes) if (k.time >= t0 && k.time <= t1) ids.add(k.id)
    rig.setKeySelection(ids)
  }
  const onLaneUp = (e: React.PointerEvent) => {
    const g = gesture.current
    cancelLongPress()
    gesture.current = null
    setMarquee(null)
    if (g?.kind !== 'lane' || g.consumed || g.moved) return
    if (!g.additive) rig.clearKeySelection()
    rig.pause()
    rig.setTime(snapToFrame(timeAt(e.clientX)))
  }

  // --- Keyframes : sélection, glissé ---
  const onKeyPointerDown = (e: React.PointerEvent, id: number, time: number) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const additive = e.shiftKey || e.metaKey || e.ctrlKey
    if (additive) rig.toggleKeySelection(id)
    else if (!rigStore.keySelection.has(id)) rig.setKeySelection([id])
    gesture.current = {
      kind: 'key',
      id,
      startX: e.clientX,
      grab: timeAt(e.clientX) - time,
      alt: e.altKey,
      additive,
      moved: false,
      consumed: false,
    }
    armLongPress(e, id)
  }
  const onKeyMove = (e: React.PointerEvent) => {
    const g = gesture.current
    if (g?.kind !== 'key' || g.consumed) return
    if (!g.moved) {
      if (Math.abs(e.clientX - g.startX) < DRAG_THRESHOLD) return
      // ⇧ + clic qui vient de retirer la keyframe : rien à déplacer.
      if (!rigStore.keySelection.has(g.id)) return
      g.moved = true
      cancelLongPress()
      rig.beginKeyDrag(g.alt)
      setDraggingId(g.id)
    }
    edgeScroll(e.clientX)
    rig.dragKeys(g.id, timeAt(e.clientX) - g.grab)
  }
  const onKeyUp = (id: number) => {
    const g = gesture.current
    cancelLongPress()
    gesture.current = null
    if (g?.kind !== 'key' || g.consumed) return
    if (g.moved) {
      rig.endKeyDrag()
      setDraggingId(null)
    } else if (!g.additive) {
      // Clic simple : ne garder qu'elle (même au sein d'une sélection) et y aller.
      rig.setKeySelection([id])
      rig.goToKeyframe(id)
    }
  }
  const onKeyCancel = () => {
    cancelLongPress()
    if (gesture.current?.kind === 'key' && gesture.current.moved) rig.endKeyDrag()
    gesture.current = null
    setDraggingId(null)
  }

  // Graduations : le pas principal s'adapte au zoom ; les images sont tracées
  // en fond dès qu'elles sont assez espacées pour se lire.
  const major = MAJOR_STEPS.find((s) => s * pxPerSec >= MIN_MAJOR_PX) ?? 60
  const majors: number[] = []
  if (width > 0) for (let i = 0; i * major <= duration + 1e-6; i++) majors.push(i * major)
  const framePx = pxPerSec / FPS
  const frameGrid =
    framePx >= 5
      ? {
          backgroundImage:
            'repeating-linear-gradient(to right, var(--color-panel-row) 0 1px, transparent 1px 100%)',
          backgroundSize: `${framePx}px 100%`,
        }
      : undefined

  const dragging = draggingId !== null ? rig.keyframes.find((k) => k.id === draggingId) : undefined
  const pct = (t: number) => `${(t / duration) * 100}%`

  return (
    <>
      <div
        ref={viewportRef}
        // La piste est une capsule pleine, sans contour : c'est la surface qui
        // la détache du fond de la carte.
        className="mynd-scroll-x relative overflow-x-auto overflow-y-hidden rounded-lg bg-surface-elevated"
      >
        {/* Marge intérieure : une keyframe à 0 s ou en fin d'animation reste
            entière, au lieu d'être coupée par le bord arrondi de la piste. */}
        <div className="px-3 select-none" style={{ width: `${zoom * 100}%` }}>
        <div ref={contentRef} className="relative">
          {/* Règle */}
          <div
            onPointerDown={onRulerDown}
            onPointerMove={onRulerMove}
            onPointerUp={() => (gesture.current = null)}
            onPointerCancel={() => (gesture.current = null)}
            className="relative h-6 cursor-ew-resize touch-none"
            title="Glisse pour parcourir le temps"
          >
            {majors.map((t) => (
              <div
                key={t}
                className="absolute top-0 h-full w-px bg-panel-row"
                style={{ left: pct(t) }}
              >
                {/* La dernière graduation écrit vers l'intérieur : à droite du
                    bord, elle ferait défiler la piste de quelques pixels. */}
                <span
                  className={
                    'absolute top-0 whitespace-nowrap text-[10px] leading-6 text-meta-ink ' +
                    (t > duration - major / 2 ? 'right-1.5' : 'left-1.5')
                  }
                >
                  {Number(t.toFixed(2))}s
                </span>
              </div>
            ))}
            {dragging && (
              <span
                className="absolute top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full
                           bg-ink px-2 py-0.5 font-mono text-[11px] font-semibold text-cream"
                style={{ left: pct(dragging.time) }}
              >
                {formatTime(dragging.time)}
              </span>
            )}
          </div>

          {/* Couloir des keyframes */}
          <div
            onPointerDown={onLaneDown}
            onPointerMove={onLaneMove}
            onPointerUp={onLaneUp}
            onPointerCancel={() => {
              cancelLongPress()
              gesture.current = null
              setMarquee(null)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              openMenu(e.clientX, e.clientY, null)
            }}
            data-timeline-lane
            className="relative h-11 touch-none md:h-12"
            style={frameGrid}
          >
            {rig.keyframes.length === 0 && (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-[12px] text-meta-ink">
                Pose le personnage puis appuie sur Keyframe — ou active l’auto-keyframe
              </p>
            )}

            {marquee && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-1 rounded-card bg-action/15"
                style={{ left: Math.min(marquee.a, marquee.b), width: Math.abs(marquee.b - marquee.a) }}
              />
            )}

            {rig.keyframes.map((k) => {
              const selected = rig.keySelection.has(k.id)
              return (
                <button
                  key={k.id}
                  type="button"
                  title={`${formatTime(k.time)} · ${INTERP_META[k.interp].label}`}
                  aria-label={`Keyframe à ${formatTime(k.time)}, ${INTERP_META[k.interp].label}`}
                  aria-pressed={selected}
                  onPointerDown={(e) => onKeyPointerDown(e, k.id, k.time)}
                  onPointerMove={onKeyMove}
                  onPointerUp={() => onKeyUp(k.id)}
                  onPointerCancel={onKeyCancel}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    openMenu(e.clientX, e.clientY, k.id)
                  }}
                  onKeyDown={(e) => {
                    // Clavier : Entrée = le clic simple (Espace reste la lecture).
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      rig.setKeySelection([k.id])
                      rig.goToKeyframe(k.id)
                    }
                  }}
                  // Cible plus large que le dessin (le doigt), centrée dessus.
                  className={
                    'group absolute top-0 grid h-full w-6 -translate-x-1/2 cursor-grab place-items-center ' +
                    'touch-none active:cursor-grabbing ' +
                    (selected ? 'z-20' : 'z-10')
                  }
                  style={{ left: pct(k.time) }}
                >
                  <span
                    className={
                      'grid place-items-center transition-transform duration-[120ms] ease-out ' +
                      'group-hover:scale-125 motion-reduce:transition-none ' +
                      (selected ? 'scale-110' : '')
                    }
                  >
                    <KeyGlyph interp={k.interp} selected={selected} />
                  </span>
                </button>
              )
            })}
          </div>

          {/* Playhead — position écrite en rAF par la carte. Rouge en
              auto-keyframe : on voit qu'on enregistre, comme dans tout
              logiciel d'animation. */}
          <div
            ref={playheadRef}
            className={
              'pointer-events-none absolute inset-y-0 z-30 w-0.5 -translate-x-1/2 rounded-full ' +
              (rig.autoKey ? 'bg-destructive' : 'bg-action')
            }
            style={{ left: '0%' }}
          >
            <div
              className={
                'absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full ' +
                (rig.autoKey ? 'bg-destructive' : 'bg-action')
              }
            />
          </div>
        </div>
        </div>
      </div>

      {menu && (
        <TrackContextMenu
          key={`${menu.x}:${menu.y}:${menu.keyId}`}
          state={menu}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  )
}
