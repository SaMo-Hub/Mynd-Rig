import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRig } from './useRig'
import { FPS, rigStore, snapToFrame, type Interp, type Keyframe } from './rigStore'
import { ELEMENTS, type ElementDef, type PropDef } from './tracks'
import { INTERP_META, KeyGlyph, TrackContextMenu, commonInterp, type ContextMenuState } from './KeyframeMenus'
import { IconChevron } from '../ui/icons'

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
/** Hauteur d'une piste. */
const ROW_H = 28
/** Hauteur de la règle. */
const RULER_H = 24
/** Colonne des noms de pistes, collée à gauche quand la piste défile. */
export const LABEL_W = 136
/** Pistes visibles avant défilement vertical (la demi-piste dit qu'il y a une suite). */
const VISIBLE_ROWS = 7.5
const STORE_KEY = 'mynd:timeline-tracks'

type Gesture =
  | {
      kind: 'key'
      ids: number[]
      startX: number
      /** écart pointeur → keyframe, pour qu'elle ne saute pas sous le doigt. */
      grab: number
      alt: boolean
      additive: boolean
      moved: boolean
      consumed: boolean
    }
  | {
      kind: 'lane'
      startX: number
      startY: number
      row: number
      base: Set<number>
      additive: boolean
      moved: boolean
      consumed: boolean
    }
  | { kind: 'ruler' }

/**
 * Une ligne de la timeline :
 * - `all` : toutes les pistes résumées en une (pistes repliées) ;
 * - `element` : un élément (calque), qui résume ses propriétés ;
 * - `prop` : une propriété d'un élément déplié.
 */
interface Row {
  key: string
  kind: 'all' | 'element' | 'prop'
  label: string
  /** propriétés dont la ligne montre les keyframes. */
  props: Set<string>
  element?: ElementDef
  prop?: PropDef
}

/** Un repère dessiné : les keyframes de la ligne qui tombent au même instant. */
interface Item {
  ids: number[]
  time: number
  interp: Interp | null
}

function formatTime(t: number): string {
  return `${t.toFixed(2)}s`
}

function groupItems(keyframes: Keyframe[], props: Set<string>): Item[] {
  const byTime = new Map<number, { ids: number[]; time: number; interps: Interp[] }>()
  for (const k of keyframes) {
    if (!props.has(k.prop)) continue
    const slot = Math.round(k.time * 10000)
    let it = byTime.get(slot)
    if (!it) byTime.set(slot, (it = { ids: [], time: k.time, interps: [] }))
    it.ids.push(k.id)
    it.interps.push(k.interp)
  }
  return [...byTime.values()].map((it) => ({ ids: it.ids, time: it.time, interp: commonInterp(it.interps) }))
}

/**
 * Pistes dépliées ou résumées en une ligne. Le choix de l'utilisateur est
 * mémorisé ; à défaut, un cadre bas (l'éditeur en iframe) les replie, sinon
 * elles mangeraient la scène.
 */
function readTracksOpen(): boolean {
  let saved: string | null = null
  try {
    saved = localStorage.getItem(STORE_KEY)
  } catch {
    /* stockage indisponible (iframe tierce, navigation privée) */
  }
  if (saved) return saved === 'open'
  return window.matchMedia('(min-height: 820px)').matches
}

/**
 * La piste de la timeline : une **règle** en haut (on y fait défiler le temps)
 * et, dessous, **une ligne par élément** — corps, regard, chaque membre — qui
 * se déplie en ses propriétés, comme les calques d'After Effects. C'est ce qui
 * permet de décaler un bras par rapport à une jambe, ou d'animer la rondeur
 * seule. Repliées, toutes les pistes se résument en une ligne.
 *
 * Gestes des lignes :
 * - clic sur un repère : le sélectionne et y amène le playhead ;
 *   ⇧ / ⌘ + clic : l'ajoute ou le retire de la sélection ;
 * - glisser un repère : déplace toute la sélection, calée sur les images ;
 *   avec Alt : en laisse une copie ;
 * - glisser dans le vide : sélection au lasso, sur plusieurs lignes
 *   (⇧ : ajoute) ; clic dans le vide : sélectionne l'élément de la ligne et
 *   y amène le playhead ;
 * - clic droit / appui long : menu contextuel.
 *
 * Un repère d'élément (ou de la ligne résumée) porte toutes les keyframes de
 * cet instant : le glisser les déplace ensemble.
 *
 * Le zoom (⌘ + molette, pincement du trackpad) élargit le contenu ; la piste
 * défile alors horizontalement, les noms de pistes restant en place.
 */
export function TimelineTrack({
  zoom,
  viewportRef,
  contentRef,
  playheadRef,
  knobRef,
}: {
  zoom: number
  viewportRef: React.RefObject<HTMLDivElement | null>
  contentRef: React.RefObject<HTMLDivElement | null>
  playheadRef: React.RefObject<HTMLDivElement | null>
  knobRef: React.RefObject<HTMLDivElement | null>
}) {
  const rig = useRig()
  const gesture = useRef<Gesture | null>(null)
  const lanesRef = useRef<HTMLDivElement>(null)
  const longPress = useRef(0)
  const [width, setWidth] = useState(0)
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [dragLead, setDragLead] = useState<number | null>(null)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [tracksOpen, setTracksOpen] = useState(readTracksOpen)
  const [openEls, setOpenEls] = useState<Set<string>>(() => new Set())

  const toggleTracks = () => {
    const next = !tracksOpen
    setTracksOpen(next)
    try {
      localStorage.setItem(STORE_KEY, next ? 'open' : 'closed')
    } catch {
      /* stockage indisponible (iframe tierce, navigation privée) */
    }
  }

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [contentRef])

  const rows = useMemo<Row[]>(() => {
    if (!tracksOpen) {
      return [{ key: 'all', kind: 'all', label: 'Toutes', props: new Set(ELEMENTS.flatMap((e) => e.props.map((p) => p.id))) }]
    }
    return ELEMENTS.flatMap((el) => {
      const head: Row = {
        key: el.id,
        kind: 'element',
        label: el.label,
        props: new Set(el.props.map((p) => p.id)),
        element: el,
      }
      if (el.props.length < 2 || !openEls.has(el.id)) return [head]
      return [
        head,
        ...el.props.map<Row>((p) => ({
          key: p.id,
          kind: 'prop',
          label: p.label,
          props: new Set([p.id]),
          element: el,
          prop: p,
        })),
      ]
    })
  }, [tracksOpen, openEls])

  // Recalculé à chaque rendu : les keyframes sont mutées sur place pendant un
  // glissé, une mémoïsation sur leur tableau ne verrait rien passer.
  const items = rows.map((r) => groupItems(rig.keyframes, r.props))

  // Un élément sélectionné sur la scène : sa ligne est ramenée dans la vue.
  useEffect(() => {
    const vp = viewportRef.current
    const i = rows.findIndex((r) => r.kind === 'element' && r.element?.id === rig.selected)
    if (!vp || i < 0) return
    const top = RULER_H + i * ROW_H
    if (top < vp.scrollTop + RULER_H) vp.scrollTop = top - RULER_H
    else if (top + ROW_H > vp.scrollTop + vp.clientHeight) vp.scrollTop = top + ROW_H - vp.clientHeight
  }, [rig.selected, rows, viewportRef])

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
  const lanePoint = (clientX: number, clientY: number) => {
    const r = lanesRef.current?.getBoundingClientRect()
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) }
  }
  const rowAt = (y: number) => Math.max(0, Math.min(rows.length - 1, Math.floor(y / ROW_H)))

  /** Piste zoomée : un glissé qui approche d'un bord la fait défiler. */
  const edgeScroll = (clientX: number) => {
    const vp = viewportRef.current
    if (!vp || zoom <= 1) return
    const r = vp.getBoundingClientRect()
    if (clientX < r.left + LABEL_W + EDGE_SCROLL_PX) vp.scrollLeft -= 12
    else if (clientX > r.right - EDGE_SCROLL_PX) vp.scrollLeft += 12
  }

  /** Propriétés visées par « Insérer une keyframe ici » sur une ligne. */
  const insertProps = (row: Row): string[] | undefined => {
    if (row.kind === 'prop') return [row.prop!.id]
    if (row.kind === 'all') return undefined
    const el = row.element!
    const animated = el.props.filter((p) => rigStore.isAnimated(p.id))
    return (animated.length > 0 ? animated : el.primary).map((p) => p.id)
  }

  const cancelLongPress = () => window.clearTimeout(longPress.current)
  const armLongPress = (e: React.PointerEvent, ids: number[] | null, row: Row) => {
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
      openMenu(x, y, ids, row, true)
    }, LONG_PRESS_MS)
  }

  const openMenu = (x: number, y: number, ids: number[] | null, row: Row, touch = false) => {
    // Le menu d'une keyframe agit sur la sélection : on y inclut le repère
    // visé, sans défaire une sélection multiple qui le contient déjà.
    if (ids && !ids.every((id) => rigStore.keySelection.has(id))) rigStore.setKeySelection(ids)
    setMenu({
      x,
      y,
      time: timeAt(x),
      keyIds: ids,
      props: insertProps(row),
      rowLabel: row.kind === 'prop' ? `${row.element!.label} · ${row.label}` : row.label,
      touch,
    })
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

  // --- Lignes : lasso, clic dans le vide ---
  // Tous les gestes des lignes sont capturés par le conteneur des lignes, pas
  // par le repère : pendant un glissé, les repères se regroupent et se
  // re-créent, et un élément démonté perdrait la capture du pointeur.
  const onLaneDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const additive = e.shiftKey || e.metaKey || e.ctrlKey
    const p = lanePoint(e.clientX, e.clientY)
    const row = rowAt(p.y)
    gesture.current = {
      kind: 'lane',
      startX: e.clientX,
      startY: e.clientY,
      row,
      base: additive ? new Set(rigStore.keySelection) : new Set(),
      additive,
      moved: false,
      consumed: false,
    }
    armLongPress(e, null, rows[row])
  }

  const onKeyDown = (e: React.PointerEvent, item: Item, row: Row) => {
    if (e.button !== 0) return
    e.stopPropagation()
    lanesRef.current?.setPointerCapture(e.pointerId)
    const additive = e.shiftKey || e.metaKey || e.ctrlKey
    const sel = rigStore.keySelection
    if (additive) rig.toggleKeySelection(item.ids)
    else if (!item.ids.every((id) => sel.has(id))) rig.setKeySelection(item.ids)
    gesture.current = {
      kind: 'key',
      ids: item.ids,
      startX: e.clientX,
      grab: timeAt(e.clientX) - item.time,
      alt: e.altKey,
      additive,
      moved: false,
      consumed: false,
    }
    armLongPress(e, item.ids, row)
  }

  const onLaneMove = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g || g.kind === 'ruler' || g.consumed) return

    if (g.kind === 'key') {
      if (!g.moved) {
        if (Math.abs(e.clientX - g.startX) < DRAG_THRESHOLD) return
        // ⇧ + clic qui vient de retirer le repère : rien à déplacer.
        if (!g.ids.every((id) => rigStore.keySelection.has(id))) return
        g.moved = true
        cancelLongPress()
        rig.beginKeyDrag(g.alt)
        setDragLead(g.ids[0])
      }
      edgeScroll(e.clientX)
      rig.dragKeys(g.ids[0], timeAt(e.clientX) - g.grab)
      return
    }

    if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < DRAG_THRESHOLD) return
    g.moved = true
    cancelLongPress()
    edgeScroll(e.clientX)
    const a = lanePoint(g.startX, g.startY)
    const b = lanePoint(e.clientX, e.clientY)
    setMarquee({ x0: a.x, y0: a.y, x1: b.x, y1: b.y })
    const t0 = timeAt(Math.min(g.startX, e.clientX))
    const t1 = timeAt(Math.max(g.startX, e.clientX))
    const r0 = rowAt(Math.min(a.y, b.y))
    const r1 = rowAt(Math.max(a.y, b.y))
    const ids = new Set(g.base)
    for (let r = r0; r <= r1; r++) {
      for (const it of items[r]) if (it.time >= t0 && it.time <= t1) it.ids.forEach((id) => ids.add(id))
    }
    rig.setKeySelection(ids)
  }

  const onLaneUp = (e: React.PointerEvent) => {
    const g = gesture.current
    cancelLongPress()
    gesture.current = null
    setMarquee(null)
    if (!g || g.kind === 'ruler' || g.consumed) return

    if (g.kind === 'key') {
      if (g.moved) {
        rig.endKeyDrag()
        setDragLead(null)
      } else if (!g.additive) {
        // Clic simple : ne garder que ce repère (même au sein d'une
        // sélection) et y aller.
        rig.setKeySelection(g.ids)
        rig.goToKeyframe(g.ids[0])
      }
      return
    }

    if (g.moved) return
    if (!g.additive) rig.clearKeySelection()
    // Cliquer dans une ligne sélectionne son élément, comme un calque.
    const row = rows[g.row]
    if (row.kind !== 'all') rig.select(row.element!.id)
    rig.pause()
    rig.setTime(snapToFrame(timeAt(e.clientX)))
  }

  const onLaneCancel = () => {
    cancelLongPress()
    if (gesture.current?.kind === 'key' && gesture.current.moved) rig.endKeyDrag()
    gesture.current = null
    setMarquee(null)
    setDragLead(null)
  }

  const toggleElement = (id: string) =>
    setOpenEls((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

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

  const dragging = dragLead !== null ? rig.keyframes.find((k) => k.id === dragLead) : undefined
  const pct = (t: number) => `${(t / duration) * 100}%`
  const rowTint = (row: Row) =>
    row.kind !== 'all' && row.element!.id === rig.selected
      ? 'bg-action/10'
      : row.kind === 'prop'
        ? 'bg-panel-row'
        : ''

  return (
    <>
      <div
        ref={viewportRef}
        // La piste est une capsule pleine, sans contour : c'est la surface qui
        // la détache du fond de la carte.
        className="mynd-scroll-x relative overflow-auto overscroll-contain rounded-lg bg-surface-elevated"
        style={{ maxHeight: RULER_H + ROW_H * (tracksOpen ? VISIBLE_ROWS : 1) + 8 }}
      >
        <div
          className="relative flex select-none"
          style={{ width: `calc(${LABEL_W}px + (100% - ${LABEL_W}px) * ${zoom})` }}
        >
          {/* Noms des pistes — collés à gauche, au-dessus de ce qui défile. */}
          <div className="sticky left-0 z-40 shrink-0 bg-surface-elevated pb-2" style={{ width: LABEL_W }}>
            <div className="sticky top-0 z-10 flex items-center bg-surface-elevated pl-1.5" style={{ height: RULER_H }}>
              <button
                type="button"
                onClick={toggleTracks}
                aria-expanded={tracksOpen}
                title={tracksOpen ? 'Replier les pistes en une ligne' : 'Une piste par élément'}
                className="flex h-6 items-center gap-1 rounded-full px-1.5 text-[11px] font-semibold
                           uppercase tracking-[0.4px] text-meta-ink hover:bg-panel-row"
              >
                <IconChevron
                  className={
                    'h-3 w-3 transition-transform duration-150 ease-out motion-reduce:transition-none ' +
                    (tracksOpen ? 'rotate-90' : '')
                  }
                />
                Pistes
              </button>
            </div>
            {rows.map((row) => (
              <RowLabel
                key={row.key}
                row={row}
                tint={rowTint(row)}
                selected={row.kind !== 'all' && row.element!.id === rig.selected}
                open={row.kind === 'element' && openEls.has(row.element!.id)}
                onToggle={() => toggleElement(row.element!.id)}
                onSelect={() => rig.select(row.kind === 'all' ? null : row.element!.id)}
              />
            ))}
          </div>

          {/* Temps. Marge intérieure : une keyframe à 0 s ou en fin
              d'animation reste entière, au lieu d'être coupée par le bord. */}
          <div className="min-w-0 flex-1 px-3 pb-2">
            <div ref={contentRef} className="relative">
              {/* Règle — collée en haut quand les pistes défilent. */}
              <div className="sticky top-0 z-30 -mx-3 bg-surface-elevated px-3">
                <div
                  onPointerDown={onRulerDown}
                  onPointerMove={onRulerMove}
                  onPointerUp={() => (gesture.current = null)}
                  onPointerCancel={() => (gesture.current = null)}
                  className="relative cursor-ew-resize touch-none"
                  style={{ height: RULER_H }}
                  title="Glisse pour parcourir le temps"
                >
                  {majors.map((t) => (
                    <div
                      key={t}
                      className="absolute top-0 h-full w-px bg-panel-row"
                      style={{ left: pct(t) }}
                    >
                      {/* La dernière graduation écrit vers l'intérieur : à droite
                          du bord, elle ferait défiler la piste de quelques pixels. */}
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
                  {/* Tête du playhead — position écrite en rAF par la carte. */}
                  <div
                    ref={knobRef}
                    className={
                      'pointer-events-none absolute bottom-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full ' +
                      (rig.autoKey ? 'bg-destructive' : 'bg-action')
                    }
                    style={{ left: '0%' }}
                  />
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
              </div>

              {/* Lignes des keyframes */}
              <div
                ref={lanesRef}
                onPointerDown={onLaneDown}
                onPointerMove={onLaneMove}
                onPointerUp={onLaneUp}
                onPointerCancel={onLaneCancel}
                onContextMenu={(e) => {
                  e.preventDefault()
                  const row = rows[rowAt(lanePoint(e.clientX, e.clientY).y)]
                  openMenu(e.clientX, e.clientY, null, row)
                }}
                data-timeline-lane
                className="relative -mx-3 touch-none px-3"
                style={{ height: rows.length * ROW_H }}
              >
                {rows.map((row, i) => (
                  <div
                    key={row.key}
                    aria-hidden
                    className={'pointer-events-none absolute inset-x-0 ' + rowTint(row)}
                    style={{ top: i * ROW_H, height: ROW_H }}
                  />
                ))}
                <div className="pointer-events-none absolute inset-y-0 left-3 right-3" style={frameGrid} />

                {rig.keyframes.length === 0 && (
                  <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-[12px] text-meta-ink">
                    Pose le personnage puis appuie sur Keyframe — ou active l’auto-keyframe
                  </p>
                )}

                <div className="absolute inset-y-0 left-3 right-3">
                  {marquee && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute rounded-card bg-action/15"
                      style={{
                        left: Math.min(marquee.x0, marquee.x1) - 12,
                        top: Math.min(marquee.y0, marquee.y1),
                        width: Math.abs(marquee.x1 - marquee.x0),
                        height: Math.abs(marquee.y1 - marquee.y0),
                      }}
                    />
                  )}

                  {rows.map((row, i) =>
                    items[i].map((it) => {
                      const nSel = it.ids.filter((id) => rig.keySelection.has(id)).length
                      const selected = nSel === it.ids.length
                      const label = it.interp ? INTERP_META[it.interp].label : 'interpolations mixtes'
                      return (
                        <button
                          key={`${row.key}:${it.ids[0]}`}
                          type="button"
                          title={`${row.label} · ${formatTime(it.time)} · ${label}`}
                          aria-label={`Keyframe ${row.label} à ${formatTime(it.time)}, ${label}`}
                          aria-pressed={selected}
                          onPointerDown={(e) => onKeyDown(e, it, row)}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            openMenu(e.clientX, e.clientY, it.ids, row)
                          }}
                          onKeyDown={(e) => {
                            // Clavier : Entrée = le clic simple (Espace reste la lecture).
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              rig.setKeySelection(it.ids)
                              rig.goToKeyframe(it.ids[0])
                            }
                          }}
                          // Cible plus large que le dessin (le doigt), centrée dessus.
                          className={
                            'group absolute grid w-6 -translate-x-1/2 cursor-grab place-items-center ' +
                            'touch-none active:cursor-grabbing ' +
                            (selected ? 'z-20' : 'z-10')
                          }
                          style={{ left: pct(it.time), top: i * ROW_H, height: ROW_H }}
                        >
                          <span
                            className={
                              'grid place-items-center transition-transform duration-[120ms] ease-out ' +
                              'group-hover:scale-125 motion-reduce:transition-none ' +
                              (selected ? 'scale-110' : '') +
                              (nSel > 0 && !selected ? ' opacity-70' : '')
                            }
                          >
                            <KeyGlyph interp={it.interp} selected={nSel > 0} small={row.kind === 'prop'} />
                          </span>
                        </button>
                      )
                    }),
                  )}
                </div>
              </div>

              {/* Playhead — position écrite en rAF par la carte. Rouge en
                  auto-keyframe : on voit qu'on enregistre, comme dans tout
                  logiciel d'animation. */}
              <div
                ref={playheadRef}
                className={
                  'pointer-events-none absolute bottom-0 z-30 w-0.5 -translate-x-1/2 rounded-full ' +
                  (rig.autoKey ? 'bg-destructive' : 'bg-action')
                }
                style={{ left: '0%', top: RULER_H }}
              />
            </div>
          </div>
        </div>
      </div>

      {menu && (
        <TrackContextMenu
          key={`${menu.x}:${menu.y}:${menu.keyIds?.[0]}`}
          state={menu}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  )
}

/** Nom d'une piste : chevron de dépliage, puis le nom, qui sélectionne l'élément. */
function RowLabel({
  row,
  tint,
  selected,
  open,
  onToggle,
  onSelect,
}: {
  row: Row
  tint: string
  selected: boolean
  open: boolean
  onToggle: () => void
  onSelect: () => void
}) {
  const expandable = row.kind === 'element' && row.element!.props.length > 1

  return (
    <div className={'flex items-center pr-2 ' + tint} style={{ height: ROW_H }}>
      {row.kind === 'prop' ? (
        <span className="w-6 shrink-0" />
      ) : expandable ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? 'Replier' : 'Déplier'} les propriétés de ${row.label}`}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-meta-ink hover:bg-panel-row"
        >
          <IconChevron
            className={
              'h-3 w-3 transition-transform duration-150 ease-out motion-reduce:transition-none ' +
              (open ? 'rotate-90' : '')
            }
          />
        </button>
      ) : (
        <span className="w-6 shrink-0" />
      )}
      <button
        type="button"
        onClick={onSelect}
        className={
          'min-w-0 truncate rounded-full px-1.5 py-0.5 text-left ' +
          (row.kind === 'prop'
            ? 'pl-3 text-[12px] text-ink-soft hover:text-text-primary'
            : 'text-[12px] font-semibold hover:bg-panel-row ' +
              (selected ? 'text-action-ink' : 'text-text-primary'))
        }
        title={row.kind === 'all' ? 'Toutes les pistes' : `Sélectionner ${row.element!.label}`}
      >
        {row.label}
      </button>
    </div>
  )
}
