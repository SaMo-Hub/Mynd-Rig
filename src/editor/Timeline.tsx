import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useRig } from './useRig'
import { FPS, rigStore } from './rigStore'
import { LABEL_W, TimelineTrack } from './TimelineTrack'
import { InterpMenu, ShortcutsHelp } from './KeyframeMenus'
import { NumberField } from '../ui/NumberField'
import { IconButton } from '../ui/IconButton'
import { Button } from '../ui/Button'
import { mod } from '../ui/keys'
import {
  IconCopy,
  IconDuplicate,
  IconKeyNext,
  IconKeyPrev,
  IconLoop,
  IconPaste,
  IconPause,
  IconPlay,
  IconRecord,
  IconSkipStart,
  IconStretch,
  IconTrash,
  IconZoomIn,
  IconZoomOut,
} from '../ui/icons'

const MAX_ZOOM = 16
const ZOOM_STEP = 1.5
/** Au-delà, zoomer n'apporte plus rien : une image fait déjà cette largeur. */
const MAX_FRAME_PX = 60

/** Zoom maximal utile pour la durée et la largeur de piste données. */
function maxZoomFor(duration: number, viewportWidth: number): number {
  const lanes = viewportWidth - LABEL_W
  if (lanes <= 0) return MAX_ZOOM
  return Math.max(1, Math.min(MAX_ZOOM, (MAX_FRAME_PX * FPS * duration) / lanes))
}

/**
 * La carte du **temps** : transport, durée, règle, keyframes, playhead.
 *
 * « Lire » est le **bouton rond flottant** de la DA (verre teinté `action`,
 * 56 px), l'unique élément accentué de la carte. Tout le reste est en `ghost`,
 * sauf l'auto-keyframe **allumé**, rouge comme le bouton d'enregistrement de
 * tous les logiciels d'animation — le playhead rougit avec lui.
 *
 * L'en-tête tient sur **une seule ligne à hauteur fixe** : sélectionner une
 * keyframe y fait apparaître ses actions à droite, et un en-tête qui passerait
 * sur deux lignes redimensionnerait la scène à chaque clic. Les commandes
 * secondaires se replient donc par paliers de largeur (le cadre de l'iframe),
 * et restent toutes accessibles au clavier et dans le menu contextuel.
 *
 * Le playhead est mis à jour dans une boucle rAF (lecture fluide sans re-render
 * React à chaque frame).
 */
export function Timeline() {
  const rig = useRig()
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const playheadRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const timeLabelRef = useRef<HTMLSpanElement>(null)
  const frameLabelRef = useRef<HTMLSpanElement>(null)
  const [zoom, setZoom] = useState(1)
  const [stretch, setStretch] = useState(false)
  const canPlay = rig.keyframes.length >= 2

  // Boucle rAF : reflète currentTime sur le playhead ; en lecture zoomée, la
  // piste défile pour le garder en vue.
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const f = rigStore.currentTime / rigStore.duration
      if (playheadRef.current) playheadRef.current.style.left = `${f * 100}%`
      if (knobRef.current) knobRef.current.style.left = `${f * 100}%`
      if (timeLabelRef.current) timeLabelRef.current.textContent = `${rigStore.currentTime.toFixed(2)}s`
      if (frameLabelRef.current)
        frameLabelRef.current.textContent = `image ${Math.round(rigStore.currentTime * FPS)}`
      const vp = viewportRef.current
      const ct = contentRef.current
      if (rigStore.playing && vp && ct && ct.clientWidth > vp.clientWidth) {
        // La colonne des noms de pistes masque le bord gauche de la vue.
        const x = ct.offsetLeft + f * ct.clientWidth
        if (x < vp.scrollLeft + LABEL_W || x > vp.scrollLeft + vp.clientWidth - 16) {
          vp.scrollLeft = x - LABEL_W - (vp.clientWidth - LABEL_W) * 0.1
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // --- Zoom, ancré sous le pointeur (molette) ou sur le playhead (boutons) ---
  const anchor = useRef<{ f: number; offset: number } | null>(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  const zoomTo = useCallback((next: number, clientX?: number) => {
    const vp = viewportRef.current
    const ct = contentRef.current
    if (!vp || !ct) return
    next = Math.max(1, Math.min(maxZoomFor(rigStore.duration, vp.clientWidth), next))
    if (next === zoomRef.current) return
    const vr = vp.getBoundingClientRect()
    const cr = ct.getBoundingClientRect()
    let x = clientX
    if (x === undefined) {
      const ph = cr.left + (rigStore.currentTime / rigStore.duration) * cr.width
      x = ph >= vr.left + LABEL_W && ph <= vr.right ? ph : vr.left + (vr.width + LABEL_W) / 2
    }
    anchor.current = { f: (x - cr.left) / (cr.width || 1), offset: x - vr.left }
    setZoom(next)
  }, [])

  useLayoutEffect(() => {
    const a = anchor.current
    const vp = viewportRef.current
    const ct = contentRef.current
    if (!a || !vp || !ct) return
    vp.scrollLeft = ct.offsetLeft + a.f * ct.clientWidth - a.offset
    anchor.current = null
  }, [zoom])

  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    // ⌘/Ctrl + molette — c'est aussi ce qu'envoie le pincement d'un trackpad.
    // Écouteur non passif : il faut empêcher le zoom de la page.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      zoomTo(zoomRef.current * Math.exp(-e.deltaY * 0.01), e.clientX)
    }
    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => vp.removeEventListener('wheel', onWheel)
  }, [zoomTo])

  // Une durée raccourcie peut rendre le zoom courant excessif.
  const maxZoom = maxZoomFor(rig.duration, viewportRef.current?.clientWidth ?? 0)
  useEffect(() => {
    if (zoom > maxZoom) setZoom(maxZoom)
  }, [zoom, maxZoom])

  const sel = rig.selectedKeyframes
  // Le champ « à » s'affiche quand toute la sélection tombe au même instant
  // (une keyframe, ou un repère d'élément qui en regroupe plusieurs).
  const sameTime =
    sel.length > 0 && sel.every((k) => Math.abs(k.time - sel[0].time) < 1e-6) ? sel[0].time : null
  const durationMin = stretch ? 0.5 : Math.max(0.5, rig.lastKeyTime)

  return (
    <section className="flex shrink-0 items-center gap-3 rounded-xl bg-surface p-3 shadow-card md:gap-4 md:p-4">
      {/* Transport */}
      <div className="flex shrink-0 items-center gap-2">
        <IconButton
          variant="action"
          size={48}
          className="md:!h-14 md:!w-14"
          label={canPlay ? (rig.playing ? 'Pause (Espace)' : 'Lire (Espace)') : 'Ajoute au moins 2 keyframes'}
          disabled={!canPlay}
          onClick={() => rig.togglePlay()}
        >
          {rig.playing ? <IconPause className="h-6 w-6" /> : <IconPlay className="h-6 w-6" />}
        </IconButton>
        <IconButton label="Retour au début (Début)" className="max-sm:hidden" onClick={() => rig.goToStart()}>
          <IconSkipStart />
        </IconButton>
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-2 flex h-11 items-center gap-1 text-[13px] text-ink-soft">
          {/* Temps courant */}
          <div className="mr-1 flex shrink-0 flex-col justify-center leading-tight">
            <span ref={timeLabelRef} className="font-mono text-[15px] font-semibold text-text-primary">
              0.00s
            </span>
            <span ref={frameLabelRef} className="hidden text-[11px] text-meta-ink md:block">
              image 0
            </span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            disabled={rig.keyframes.length === 0}
            onClick={() => rig.jumpToKeyframe(-1)}
            title="Keyframe précédente (⇧←)"
            aria-label="Keyframe précédente"
          >
            <IconKeyPrev />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={rig.keyframes.length === 0}
            onClick={() => rig.jumpToKeyframe(1)}
            title="Keyframe suivante (⇧→)"
            aria-label="Keyframe suivante"
          >
            <IconKeyNext />
          </Button>

          <Button
            variant="ghost"
            active={rig.autoKey}
            tone="destructive"
            onClick={() => rig.setAutoKey(!rig.autoKey)}
            title={
              rig.autoKey
                ? 'Auto-keyframe activé : chaque modification de la pose est enregistrée au playhead (N)'
                : 'Activer l’auto-keyframe : chaque modification de la pose sera enregistrée au playhead (N)'
            }
            aria-label="Auto-keyframe"
            className="shrink-0 !px-3 lg:!px-4"
          >
            <IconRecord />
            <span className="hidden lg:inline">Auto</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            active={rig.loop}
            tone="soft"
            onClick={() => rig.setLoop(!rig.loop)}
            title={rig.loop ? 'Lecture en boucle' : 'Lecture une fois'}
            aria-label="Lecture en boucle"
            className="max-md:hidden"
          >
            <IconLoop />
          </Button>

          <NumberField
            className="ml-1 max-sm:hidden"
            label="Durée"
            value={Number(rig.duration.toFixed(3))}
            min={durationMin}
            step={0.25}
            suffix="s"
            title={
              stretch
                ? 'Les keyframes s’étirent avec la durée'
                : 'Ne descend pas sous la dernière keyframe — active « Étirer » pour accélérer l’animation'
            }
            onChange={(v) => rig.setDuration(v, stretch)}
          />
          <Button
            variant="ghost"
            size="icon"
            active={stretch}
            tone="soft"
            onClick={() => setStretch((v) => !v)}
            title={
              stretch
                ? 'Étirer : les keyframes suivent la durée (accélère ou ralentit l’animation)'
                : 'Étirer les keyframes avec la durée'
            }
            aria-label="Étirer les keyframes avec la durée"
            className="max-lg:hidden"
          >
            <IconStretch />
          </Button>

          {/* Droite : la sélection et ses actions, ou le compte. */}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {sel.length > 0 ? (
              <>
                <span className="mr-1 hidden whitespace-nowrap xl:inline">
                  {sel.length} sélectionnée{sel.length > 1 ? 's' : ''}
                </span>
                {sameTime !== null && (
                  <NumberField
                    className="mr-1 max-xl:hidden"
                    label="à"
                    value={Number(sameTime.toFixed(3))}
                    min={0}
                    max={rig.duration}
                    step={1 / FPS}
                    suffix="s"
                    title="Instant de la keyframe (calé sur les images)"
                    onChange={(v) => rig.setSelectionTime(v)}
                  />
                )}
                <InterpMenu />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => rig.copySelected()}
                  title={`Copier (${mod('C')})`}
                  aria-label="Copier la sélection"
                  className="max-lg:hidden"
                >
                  <IconCopy />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => rig.duplicateSelected()}
                  title={`Dupliquer (${mod('D')})`}
                  aria-label="Dupliquer la sélection"
                  className="max-sm:hidden"
                >
                  <IconDuplicate />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => rig.deleteSelected()}
                  title="Supprimer (⌫)"
                  aria-label={`Supprimer ${sel.length > 1 ? `les ${sel.length} keyframes` : 'la keyframe'}`}
                  className="!text-destructive"
                >
                  <IconTrash />
                </Button>
              </>
            ) : (
              <>
                {rig.clipboard && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => rig.paste()}
                    title={`Coller au playhead (${mod('V')})`}
                    aria-label="Coller au playhead"
                  >
                    <IconPaste />
                  </Button>
                )}
                <span className="mx-1 hidden whitespace-nowrap lg:inline">
                  {rig.keyframes.length} keyframe{rig.keyframes.length > 1 ? 's' : ''}
                </span>
              </>
            )}

            <div className="hidden items-center lg:flex">
              <Button
                variant="ghost"
                size="icon"
                disabled={zoom <= 1}
                onClick={() => zoomTo(zoom / ZOOM_STEP)}
                title={`Dézoomer (${mod('molette')})`}
                aria-label="Dézoomer la timeline"
              >
                <IconZoomOut />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={zoom >= maxZoom - 1e-6}
                onClick={() => zoomTo(zoom * ZOOM_STEP)}
                title={`Zoomer (${mod('molette')})`}
                aria-label="Zoomer la timeline"
              >
                <IconZoomIn />
              </Button>
            </div>
            <ShortcutsHelp />
          </div>
        </div>

        <TimelineTrack
          zoom={zoom}
          viewportRef={viewportRef}
          contentRef={contentRef}
          playheadRef={playheadRef}
          knobRef={knobRef}
        />
      </div>
    </section>
  )
}
