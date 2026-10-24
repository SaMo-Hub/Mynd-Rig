import { useRig } from './useRig'
import { ELEMENT_BY_ID } from './tracks'

/**
 * Indice posé sur la scène, par ordre de priorité : une pose modifiée qui n'est
 * pas enregistrée (le prochain déplacement du playhead la perdrait),
 * l'auto-keyframe en marche, ce qui est sélectionné, ou le geste à faire.
 *
 * Il vivait dans la barre d'outils, qu'il faisait passer sur deux lignes sur un
 * écran d'ordinateur portable. Sa place est ici : il parle de ce qu'on a sous
 * le curseur, pas d'un outil. Capsule de verre posée **en haut à gauche** — le
 * bas de la scène revient à la barre d'outils flottante, et le personnage, qui
 * est centré, garde son dégagement.
 */
export function SceneHint() {
  const rig = useRig()

  return (
    <div
      data-scene-inset="top"
      className="mynd-glass-bar pointer-events-none absolute left-5 top-5 hidden lg:block
                 max-w-[min(28rem,calc(100%-2.5rem))] rounded-full px-4 py-2
                 text-[13px] font-medium text-ink-soft"
    >
      {rig.poseDirty ? (
        <>
          <span className="font-semibold text-text-primary">Pose non enregistrée</span> — K pour
          la garder
        </>
      ) : rig.autoKey && rig.mode === 'pose' ? (
        <>
          <span className="font-semibold text-destructive">Auto-keyframe</span> — chaque geste
          s’enregistre au playhead
        </>
      ) : rig.selected ? (
        <>
          Sélection :{' '}
          <span className="font-semibold text-text-primary">
            {ELEMENT_BY_ID[rig.selected]?.label ?? rig.selected}
          </span>
        </>
      ) : rig.mode === 'pose' ? (
        'Glisse une extrémité pour pivoter, le disque pour bouger le corps'
      ) : (
        'Glisse un point d’attache pour re-rigger'
      )}
    </div>
  )
}
