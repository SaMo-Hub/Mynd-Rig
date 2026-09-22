import { useEffect, useRef } from 'react'
import { useRig } from './useRig'
import { rigStore } from './rigStore'
import { NumberField } from '../ui/NumberField'
import { IconButton } from '../ui/IconButton'
import { IconPause, IconPlay, IconSkipStart } from '../ui/icons'

/**
 * La carte du **temps** : transport, durée, règle, keyframes, playhead.
 *
 * Le transport y a été rapatrié depuis la barre d'outils — lire, c'est parcourir
 * la timeline, le bouton a sa place à côté d'elle. « Lire » est le **bouton rond
 * flottant** de la DA (verre teinté `action`, 56 px), l'unique élément accentué
 * de la carte.
 *
 * Le playhead est mis à jour dans une boucle rAF (lecture fluide sans re-render
 * React à chaque frame).
 */
export function Timeline() {
  const rig = useRig()
  const trackRef = useRef<HTMLDivElement>(null)
  const playheadRef = useRef<HTMLDivElement>(null)
  const timeLabelRef = useRef<HTMLSpanElement>(null)
  const canPlay = rig.keyframes.length >= 2

  // Boucle rAF : reflète currentTime sur le playhead.
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const pct = (rigStore.currentTime / rigStore.duration) * 100
      if (playheadRef.current) playheadRef.current.style.left = `${pct}%`
      if (timeLabelRef.current)
        timeLabelRef.current.textContent = `${rigStore.currentTime.toFixed(2)}s`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const scrub = (clientX: number) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    rig.pause()
    rig.setTime(f * rig.duration)
  }

  return (
    <section className="flex shrink-0 items-center gap-3 rounded-xl bg-surface p-3 shadow-card md:gap-4 md:p-4">
      {/* Transport */}
      <div className="flex shrink-0 items-center gap-2">
        <IconButton
          variant="action"
          size={48}
          className="md:!h-14 md:!w-14"
          label={canPlay ? (rig.playing ? 'Pause' : 'Lire') : 'Ajoute au moins 2 keyframes'}
          disabled={!canPlay}
          onClick={() => rig.togglePlay()}
        >
          {rig.playing ? <IconPause className="h-6 w-6" /> : <IconPlay className="h-6 w-6" />}
        </IconButton>
        <IconButton label="Retour au début" onClick={() => rig.setTime(0)}>
          <IconSkipStart />
        </IconButton>
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-3 text-[13px] text-ink-soft">
          <span ref={timeLabelRef} className="font-mono text-[15px] font-semibold text-text-primary">
            0.00s
          </span>
          <NumberField
            className="hidden sm:flex"
            label="Durée"
            value={rig.duration}
            min={0.5}
            step={0.5}
            suffix="s"
            onChange={(v) => rig.setDuration(v || 0.5)}
          />
          <span className="ml-auto whitespace-nowrap">
            {rig.keyframes.length} keyframe{rig.keyframes.length > 1 ? 's' : ''}
          </span>
        </div>

        <div
          ref={trackRef}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            scrub(e.clientX)
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) scrub(e.clientX)
          }}
          // La piste est une capsule pleine, sans contour : c'est la surface qui
          // la détache du fond de la carte.
          className="relative h-12 cursor-pointer touch-none select-none overflow-hidden rounded-lg bg-surface-elevated md:h-14"
        >
          {/* graduations */}
          {Array.from({ length: Math.floor(rig.duration) + 1 }, (_, i) => (
            <div
              key={i}
              className="absolute top-0 h-full w-px bg-panel-row text-[10px] text-meta-ink"
              style={{ left: `${(i / rig.duration) * 100}%` }}
            >
              <span className="ml-1.5 block">{i}s</span>
            </div>
          ))}

          {/* keyframes */}
          {rig.keyframes.map((k) => (
            <button
              key={k.id}
              title={`Keyframe ${k.time.toFixed(2)}s — clic pour aller, double-clic pour supprimer`}
              aria-label={`Keyframe à ${k.time.toFixed(2)} seconde`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => rig.goToKeyframe(k.id)}
              onDoubleClick={() => rig.deleteKeyframe(k.id)}
              className="absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rotate-45
                         rounded-[4px] bg-star transition-transform duration-[120ms]
                         ease-out hover:scale-125 motion-reduce:transition-none"
              style={{ left: `${(k.time / rig.duration) * 100}%` }}
            />
          ))}

          {/* playhead */}
          <div
            ref={playheadRef}
            className="pointer-events-none absolute top-0 z-20 h-full w-0.5 -translate-x-1/2 rounded-full bg-action"
            style={{ left: '0%' }}
          >
            <div className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-action" />
          </div>
        </div>
      </div>
    </section>
  )
}
