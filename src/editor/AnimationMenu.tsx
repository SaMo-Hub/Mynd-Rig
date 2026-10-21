import { ANIMATIONS, type AnimationDef } from '../rig/animations'
import { Button } from '../ui/Button'
import { ANIMATION_ICONS, IconWand, IconWarning } from '../ui/icons'
import { MenuItem, MenuSurface, usePopover } from '../ui/Menu'
import { mod } from '../ui/keys'
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
 * affiche l'avertissement dans le menu, avant le geste — et le chargement
 * s'annule comme tout le reste.
 */
export function AnimationMenu() {
  const rig = useRig()
  const { open, setOpen, entered, rootRef } = usePopover()

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
        <MenuSurface
          entered={entered}
          label="Animations préfaites"
          className="absolute bottom-full left-0 mb-2 w-[min(20rem,calc(100vw-2rem))] origin-bottom-left"
        >
          {ANIMATIONS.map((a) => (
            <MenuItem
              key={a.id}
              icon={ANIMATION_ICONS[a.icon]}
              label={a.label}
              meta={`${a.duration}s · ${a.loop ? 'boucle' : 'une fois'}`}
              description={a.description}
              onSelect={() => apply(a)}
            />
          ))}

          {willReplace && (
            <p className="mt-1 flex items-start gap-1.5 px-3 pb-1 pt-2 text-[12px] text-destructive">
              {/* Icône + couleur : jamais la couleur seule comme signal. */}
              <IconWarning className="mt-px h-4 w-4 shrink-0" />
              Remplace les {rig.keyframes.length} keyframes actuelles (annulable avec {mod('Z')}).
            </p>
          )}
        </MenuSurface>
      )}
    </div>
  )
}
