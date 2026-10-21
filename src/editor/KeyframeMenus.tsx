import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRig } from './useRig'
import { SHORTCUTS } from './useShortcuts'
import type { Interp } from './rigStore'
import { INTERPS } from './rigStore'
import { Button } from '../ui/Button'
import { MenuItem, MenuLabel, MenuSeparator, MenuSurface, usePopover } from '../ui/Menu'
import { IS_MAC, mod } from '../ui/keys'
import {
  IconCopy,
  IconDuplicate,
  IconInterpEase,
  IconInterpHold,
  IconInterpLinear,
  IconInterpSmooth,
  IconKeyAdd,
  IconKeyboard,
  IconKeyframe,
  IconPaste,
  IconReverse,
  IconSelectAll,
  IconTrash,
} from '../ui/icons'

/** Libellé, explication et icône de chaque interpolation. */
export const INTERP_META: Record<
  Interp,
  { label: string; description: string; icon: React.ComponentType<{ className?: string }> }
> = {
  smooth: {
    label: 'Lisse',
    description: 'Passe par les keyframes sans s’y arrêter',
    icon: IconInterpSmooth,
  },
  linear: { label: 'Linéaire', description: 'Vitesse constante', icon: IconInterpLinear },
  ease: { label: 'Ralenti', description: 'Freine à l’arrivée et au départ', icon: IconInterpEase },
  hold: { label: 'Maintien', description: 'Tient la pose, puis saute', icon: IconInterpHold },
}

/**
 * Forme d'une keyframe dans la piste — la convention d'After Effects, pour
 * que l'interpolation se lise sans ouvrir de menu : cercle = lisse, losange =
 * linéaire, sablier = ralenti, carré = maintien. La forme porte l'information,
 * la couleur ne dit que la sélection.
 */
export function KeyGlyph({ interp, selected }: { interp: Interp; selected: boolean }) {
  const cls = selected
    ? 'fill-star stroke-ink'
    : 'fill-ink-blue stroke-surface-elevated'
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={'h-4 w-4 overflow-visible ' + cls} strokeWidth={1.5} strokeLinejoin="round">
      {interp === 'smooth' && <circle cx="8" cy="8" r="5.5" />}
      {interp === 'linear' && <path d="M8 1.5 14.5 8 8 14.5 1.5 8Z" />}
      {interp === 'ease' && <path d="M2 2.5 8 8 2 13.5ZM14 2.5 8 8 14 13.5Z" />}
      {interp === 'hold' && <rect x="2.5" y="2.5" width="11" height="11" rx="2" />}
    </svg>
  )
}

/** Interpolation commune à des keyframes, ou `null` si elles diffèrent. */
export function commonInterp(interps: Interp[]): Interp | null {
  return interps.length > 0 && interps.every((i) => i === interps[0]) ? interps[0] : null
}

/**
 * Bouton + menu d'interpolation de la sélection, dans l'en-tête de la timeline.
 * S'ouvre vers le haut : la timeline est en bas de la page.
 */
export function InterpMenu() {
  const rig = useRig()
  const { open, setOpen, entered, rootRef } = usePopover()
  const sel = rig.selectedKeyframes
  const current = commonInterp(sel.map((k) => k.interp))
  const Icon = INTERP_META[current ?? 'smooth'].icon

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        active={open}
        onClick={() => setOpen((v) => !v)}
        title={`Interpolation : ${current ? INTERP_META[current].label : 'mixte'}`}
        aria-label="Interpolation de la sélection"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon />
      </Button>
      {open && (
        <MenuSurface
          entered={entered}
          label="Interpolation"
          className="absolute bottom-full right-0 mb-2 w-64 origin-bottom-right"
        >
          <MenuLabel>
            Interpolation · {sel.length} keyframe{sel.length > 1 ? 's' : ''}
          </MenuLabel>
          {INTERPS.map((i) => (
            <MenuItem
              key={i}
              icon={INTERP_META[i].icon}
              label={INTERP_META[i].label}
              description={INTERP_META[i].description}
              checked={current === i}
              onSelect={() => {
                rig.setInterp(rig.keySelection, i)
                setOpen(false)
              }}
            />
          ))}
        </MenuSurface>
      )}
    </div>
  )
}

export interface ContextMenuState {
  x: number
  y: number
  /** instant sous le pointeur (insertion, collage). */
  time: number
  /** keyframe sous le pointeur, ou `null` pour la piste vide. */
  keyId: number | null
  /** ouvert au doigt : le menu se place au-dessus, pour ne pas être caché par lui. */
  touch?: boolean
}

/**
 * Menu contextuel de la piste (clic droit, appui long au doigt). Ancré au
 * pointeur, retourné vers le haut / la gauche s'il sortirait de la fenêtre.
 * Rendu dans `body` : aucun `overflow` de la timeline ne le rogne.
 */
export function TrackContextMenu({
  state,
  onClose,
}: {
  state: ContextMenuState
  onClose: () => void
}) {
  const rig = useRig()
  const { entered, rootRef, setOpen, open } = usePopover()
  const [pos, setPos] = useState({ left: state.x, top: state.y, origin: 'top left' })
  const opened = useRef(false)

  // `usePopover` gère clic extérieur et Échap ; il est ouvert dès le montage.
  useLayoutEffect(() => {
    setOpen(true)
  }, [setOpen])
  useLayoutEffect(() => {
    if (open) opened.current = true
    else if (opened.current) onClose()
  }, [open, onClose])

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const m = 8
    // Au doigt, le menu passe au-dessus du point d'appui (avec un dégagement) :
    // dessous, il serait caché par la main.
    const up = state.touch || state.y + height > window.innerHeight - m
    const y = state.touch ? state.y - 24 : state.y
    const left = state.x + width > window.innerWidth - m
    setPos({
      left: Math.max(m, left ? state.x - width : state.x),
      top: Math.max(m, up ? y - height : y),
      origin: `${up ? 'bottom' : 'top'} ${left ? 'right' : 'left'}`,
    })
  }, [state.x, state.y, state.touch, rootRef])

  const run = (fn: () => void) => () => {
    fn()
    onClose()
  }

  const sel = rig.selectedKeyframes
  const n = sel.length
  const current = commonInterp(sel.map((k) => k.interp))
  const plural = n > 1 ? `les ${n} keyframes` : 'la keyframe'
  // Au doigt, pas de clavier : les raccourcis ne seraient que du bruit.
  const kbd = (k: string) => (state.touch ? undefined : k)

  return createPortal(
    <MenuSurface
      menuRef={rootRef}
      entered={entered}
      label={state.keyId !== null ? 'Keyframe' : 'Timeline'}
      className="fixed w-72"
      style={{ left: pos.left, top: pos.top, transformOrigin: pos.origin }}
    >
      {state.keyId !== null ? (
        <>
          <MenuItem
            icon={IconKeyframe}
            label="Aller à la keyframe"
            onSelect={run(() => rig.goToKeyframe(state.keyId!))}
          />
          <MenuSeparator />
          <MenuLabel>Interpolation</MenuLabel>
          {INTERPS.map((i) => (
            <MenuItem
              key={i}
              icon={INTERP_META[i].icon}
              label={INTERP_META[i].label}
              checked={current === i}
              onSelect={run(() => rig.setInterp(rig.keySelection, i))}
            />
          ))}
          <MenuSeparator />
          <MenuItem icon={IconCopy} label="Copier" shortcut={kbd(mod('C'))} onSelect={run(() => rig.copySelected())} />
          <MenuItem
            icon={IconDuplicate}
            label="Dupliquer"
            shortcut={kbd(mod('D'))}
            onSelect={run(() => rig.duplicateSelected())}
          />
          {n > 1 && (
            <MenuItem
              icon={IconReverse}
              label="Inverser dans le temps"
              description="L’aller devient le retour"
              onSelect={run(() => rig.reverseSelected())}
            />
          )}
          <MenuSeparator />
          <MenuItem
            icon={IconTrash}
            tone="destructive"
            label={`Supprimer ${plural}`}
            shortcut={kbd('⌫')}
            onSelect={run(() => rig.deleteSelected())}
          />
        </>
      ) : (
        <>
          <MenuItem
            icon={IconKeyAdd}
            label="Insérer une keyframe ici"
            description="Reprend la pose de l’animation à cet instant"
            onSelect={run(() => rig.insertKeyframeAt(state.time))}
          />
          <MenuItem
            icon={IconPaste}
            label="Coller ici"
            shortcut={kbd(mod('V'))}
            disabled={!rig.clipboard}
            onSelect={run(() => rig.paste(state.time))}
          />
          <MenuItem
            icon={IconSelectAll}
            label="Tout sélectionner"
            shortcut={kbd(mod('A'))}
            disabled={rig.keyframes.length === 0}
            onSelect={run(() => rig.selectAllKeys())}
          />
          <MenuSeparator />
          <MenuItem
            icon={IconTrash}
            tone="destructive"
            label="Effacer toutes les keyframes"
            disabled={rig.keyframes.length === 0}
            onSelect={run(() => rig.clearKeyframes())}
          />
        </>
      )}
    </MenuSurface>,
    document.body,
  )
}

/** Aide des raccourcis clavier — inutile au doigt, donc masquée sous `md`. */
export function ShortcutsHelp() {
  const { open, setOpen, entered, rootRef } = usePopover()
  const fmt = (keys: string) => keys.replace(/mod\+?/g, IS_MAC ? '⌘' : 'Ctrl+')

  return (
    <div ref={rootRef} className="relative hidden lg:block">
      <Button
        variant="ghost"
        size="icon"
        active={open}
        onClick={() => setOpen((v) => !v)}
        title="Raccourcis clavier"
        aria-label="Raccourcis clavier"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <IconKeyboard />
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label="Raccourcis clavier"
          className={
            'absolute bottom-full right-0 z-40 mb-2 w-[25rem] origin-bottom-right rounded-xl bg-surface p-4 shadow-float ' +
            'transition duration-150 ease-out motion-reduce:transition-none ' +
            (entered ? 'scale-100 opacity-100' : 'scale-95 opacity-0')
          }
        >
          <h3 className="mb-2 text-[15px] font-bold text-text-primary">Raccourcis</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
            {SHORTCUTS.map((s) => (
              <div key={s.keys} className="contents">
                <dt className="whitespace-nowrap font-semibold text-text-primary">{fmt(s.keys)}</dt>
                <dd className="text-ink-soft">{s.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
