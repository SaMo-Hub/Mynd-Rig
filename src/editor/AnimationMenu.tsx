import { useEffect, useRef, useState } from 'react'
import { ANIMATIONS, type AnimationDef } from '../rig/animations'
import { Button } from '../ui/Button'
import { ANIMATION_ICONS, IconWand, IconWarning } from '../ui/icons'
import { useRig } from './useRig'

/**
 * Menu des animations préfaites (procédurales).
 *
 * Popover ancré au bouton plutôt que modale : l'action n'est pas bloquante et
 * l'utilisateur garde le personnage sous les yeux. L'ouverture part du trigger
 * pour la continuité spatiale — **vers le haut**, puisque la barre d'outils
 * flotte en bas de la scène : vers le bas, le menu sortait du cadre.
 *
 * Charger un preset **remplace** les keyframes : plutôt qu'une confirmation à
 * chaque clic — pénible quand on compare les quatre animations à la suite — on
 * affiche l'avertissement dans le menu, avant le geste.
 */
export function AnimationMenu() {
  const rig = useRig()
  const [open, setOpen] = useState(false)
  const [entered, setEntered] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Fermeture au clic extérieur et à Échap.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Monte fermé puis bascule à la frame suivante → la transition CSS se joue.
  useEffect(() => {
    if (!open) {
      setEntered(false)
      return
    }
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [open])

  const apply = (def: AnimationDef) => {
    rig.loadAnimation(def)
    setOpen(false)
  }

  const willReplace = rig.keyframes.length > 0

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        active={open}
        title="Charger une animation préfaite"
        aria-label="Animations préfaites"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <IconWand />
        <span className="hidden md:inline">Animations</span>
      </Button>

      {open && (
        <div
          role="menu"
          aria-label="Animations préfaites"
          className={
            'absolute bottom-full left-0 z-20 mb-2 w-[min(20rem,calc(100vw-2rem))] origin-bottom-left rounded-xl ' +
            'bg-surface p-1.5 shadow-float ' +
            'transition duration-150 ease-out motion-reduce:transition-none ' +
            (entered ? 'scale-100 opacity-100' : 'scale-95 opacity-0')
          }
        >
          {ANIMATIONS.map((a) => {
            const Icon = ANIMATION_ICONS[a.icon]
            return (
              <button
                key={a.id}
                role="menuitem"
                onClick={() => apply(a)}
                className={
                  'flex w-full items-start gap-3 rounded-card px-3 py-2.5 text-left ' +
                  'transition-colors duration-[120ms] ease-out hover:bg-surface-elevated ' +
                  'motion-reduce:transition-none'
                }
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-action" />
                <span className="min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className="text-[15px] font-semibold text-text-primary">{a.label}</span>
                    <span className="text-[12px] text-meta-ink">
                      {a.duration}s · {a.loop ? 'boucle' : 'une fois'}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-ink-soft">
                    {a.description}
                  </span>
                </span>
              </button>
            )
          })}

          {willReplace && (
            <p className="mt-1 flex items-start gap-1.5 border-t border-border px-3 pb-1 pt-2 text-[12px] text-destructive">
              {/* Icône + couleur : jamais la couleur seule comme signal. */}
              <IconWarning className="mt-px h-4 w-4 shrink-0" />
              Remplace les {rig.keyframes.length} keyframes actuelles.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
