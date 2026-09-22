import { useRig } from './useRig'
import { AnimationMenu } from './AnimationMenu'
import { Button } from '../ui/Button'
import { IconEye, IconKeyframe, IconReset } from '../ui/icons'

/** Séparateur de groupes — un lavis, pas un trait franc : on est sur du verre. */
function Sep() {
  return <div aria-hidden className="mx-0.5 h-6 w-px bg-panel-row" />
}

/**
 * Outils de pose, en **capsule de verre posée sur la scène** — le pattern de la
 * barre d'action de l'éditeur de souvenir iOS (« activer un outil fait surgir sa
 * barre à l'emplacement de la barre du bas »).
 *
 * Elle flotte au-dessus du personnage plutôt que de prendre un bandeau à part :
 * on garde la scène pleine hauteur, et les outils restent à portée du regard,
 * près de ce qu'ils modifient. Le verre laisse passer ce qui glisse dessous.
 *
 * Ne contient que ce qui touche à la **pose**. Le transport est dans la
 * timeline (c'est du temps), l'export dans l'en-tête (c'est le document).
 */
export function SceneToolbar() {
  const rig = useRig()

  return (
    <div
      data-scene-inset="bottom"
      className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3 md:bottom-5 md:px-5"
    >
      <div className="mynd-glass-bar pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-full p-1.5">
        <AnimationMenu />

        <Sep />

        <Button
          variant="ghost"
          onClick={() => rig.addKeyframe()}
          title="Enregistrer la pose actuelle à l’instant du playhead"
          aria-label="Ajouter une keyframe"
        >
          <IconKeyframe />
          <span className="hidden md:inline">Keyframe</span>
        </Button>
        <Button
          variant="ghost"
          onClick={() => rig.resetPose()}
          title="Réinitialiser la pose"
          aria-label="Réinitialiser la pose"
        >
          <IconReset />
          <span className="hidden md:inline">Reset pose</span>
        </Button>

        <Sep />

        <Button
          variant="ghost"
          onClick={() => rig.setFollowGaze(!rig.followGaze)}
          active={rig.followGaze}
          title="Les pupilles suivent le curseur de la souris"
          aria-label="Suivre le curseur du regard"
        >
          <IconEye />
          <span className="hidden md:inline">Suivre curseur</span>
        </Button>
      </div>
    </div>
  )
}
