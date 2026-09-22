import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import './glass-pill.css'

/**
 * Port web de **`GlassSegmentedPicker`** (app iOS) — le sélecteur à 2 options du
 * feed d'accueil (« Liste / Carte »), repris ici pour « Poser / Rigger ».
 *
 * C'est le composant iOS, pas une ressemblance : mêmes cotes (piste
 * `surfaceElevated` en capsule, padding 4, segment 14 px semibold, cible ≥ 44),
 * et surtout **mêmes animations**, portées une à une :
 *
 * - **grab** — le doigt se pose, la bulle enfle à 1,07
 *   (`spring(response: 0.26, dampingFraction: 0.6)`) ;
 * - **drag** — la bulle suit le doigt, centrée dessus et bornée à la piste ; la
 *   sélection bascule au passage du milieu, pas au relâchement ;
 * - **settle** — au lâcher, elle se cale sur le segment
 *   (`spring(response: 0.34, dampingFraction: 0.74)`) ;
 * - **squash « jelly »** — à chaque changement, elle s'écrase en 0,13 s
 *   (y 0,84 / x 1,10, courbe cubique) puis revient en ressort *bouncy* de 0,34 s.
 *
 * Les ressorts SwiftUI n'ont pas d'équivalent CSS : ils sont échantillonnés en
 * courbes `linear()` (cf. `--ease-settle` / `--ease-grab` / `--ease-bouncy` dans
 * `index.css`), ce qui restitue le dépassement exact plutôt qu'un
 * `cubic-bezier` approchant.
 *
 * Un **seul** gestionnaire de pointeur orchestre tap + grab + drag, comme le
 * `DragGesture(minimumDistance: 0)` de l'original.
 */
export type GlassSegment<T extends string> = {
  value: T
  label: string
  icon?: React.ComponentType<{ className?: string }>
  title?: string
}

export function GlassSegmented<T extends string>({
  value,
  segments,
  onChange,
  label,
  className = '',
}: {
  value: T
  segments: [GlassSegment<T>, GlassSegment<T>]
  onChange: (v: T) => void
  label: string
  /** Largeur du bloc — il remplit son conteneur par défaut. */
  className?: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [innerWidth, setInnerWidth] = useState(0)
  /** Position de la bulle pendant un glissé ; `null` hors glissé → calée. */
  const [dragX, setDragX] = useState<number | null>(null)
  const [grabbing, setGrabbing] = useState(false)
  /** Incrémenté à chaque bascule : relance l'animation de squash. */
  const [squash, setSquash] = useState(0)

  const index = segments.findIndex((s) => s.value === value)
  const segmentWidth = innerWidth / 2

  useLayoutEffect(() => {
    const el = trackRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setInnerWidth(el.clientWidth))
    ro.observe(el)
    setInnerWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const select = useCallback(
    (i: number) => {
      if (segments[i].value === value) return
      setSquash((s) => s + 1)
      onChange(segments[i].value)
    },
    [onChange, segments, value],
  )

  const pointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setGrabbing(true)
  }

  const pointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!grabbing || segmentWidth <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.min(Math.max(e.clientX - rect.left, 0), innerWidth)
    // Le suivi ne démarre qu'au-delà de 2 px : un tap net ne fait pas glisser.
    if (Math.abs(e.movementX) > 0 || dragX !== null) {
      setDragX(Math.min(Math.max(x - segmentWidth / 2, 0), segmentWidth))
      select(x < innerWidth / 2 ? 0 : 1)
    }
  }

  const pointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    select(e.clientX - rect.left < innerWidth / 2 ? 0 : 1)
    setDragX(null)
    setGrabbing(false)
  }

  const pillX = dragX ?? index * segmentWidth

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={
        'relative flex touch-none select-none rounded-full bg-surface-elevated p-1 ' + className
      }
    >
      <div
        ref={trackRef}
        className="relative flex w-full"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={() => {
          setDragX(null)
          setGrabbing(false)
        }}
      >
        {/* La bulle : posée sous les libellés, jamais cliquable elle-même.
            Trois couches, une par transformation animée (voir `glass-pill.css`). */}
        <div
          aria-hidden
          className="mynd-pill-track pointer-events-none absolute inset-y-0 left-0"
          style={{
            width: segmentWidth || undefined,
            transform: `translateX(${pillX}px)`,
            // Pendant le glissé, la bulle colle au doigt : aucune interpolation.
            transition: dragX !== null ? 'none' : undefined,
          }}
        >
          <div
            className="mynd-pill-grab h-full w-full"
            style={{ transform: `scale(${grabbing ? 1.07 : 1})` }}
          >
            {/* `key` relance l'écrasement à chaque bascule, sans toucher aux
                deux couches au-dessus (un remount y annulerait la translation). */}
            <div key={squash} className="mynd-pill-glass h-full w-full" />
          </div>
        </div>

        {segments.map((s, i) => {
          const selected = i === index
          const Icon = s.icon
          return (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={selected}
              title={s.title}
              // Le geste du conteneur reste maître : les événements du bouton
              // y remontent par bubbling. On ne coupe donc pas ses
              // `pointer-events` (contrairement au `allowsHitTesting(false)` de
              // l'original) — sur le web, cela lui ferait perdre l'infobulle et
              // le focus au clic. `onClick` ne sert qu'au clavier ; un doublon
              // avec le `pointerup` est sans effet, `select` étant idempotent.
              onClick={() => select(i)}
              className={
                'relative z-10 flex min-h-11 min-w-0 flex-1 basis-0 items-center justify-center gap-1.5 ' +
                'whitespace-nowrap rounded-full px-3 text-[14px] font-semibold tracking-[-0.3px] ' +
                'transition-colors duration-200 ease-out motion-reduce:transition-none ' +
                (selected ? 'text-cream' : 'text-ink-soft')
              }
            >
              {Icon && <Icon className="h-5 w-5" />}
              {s.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
