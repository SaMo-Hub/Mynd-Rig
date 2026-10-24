import { useRig } from './useRig'

/**
 * Bouton keyframe d'une propriété — le losange du chronomètre d'After Effects,
 * posé au bout de la ligne du réglage dans le panneau :
 *
 * - **plein** : la propriété a une keyframe au playhead (un clic la retire) ;
 * - **contour** : la propriété est animée, mais pas à cet instant ;
 * - **pâle** : la propriété n'est pas animée — sa valeur est fixe. Un clic
 *   pose sa première keyframe et l'anime.
 *
 * `props` : plusieurs propriétés à la fois en mode lié (les 4 membres).
 */
export function KeyToggle({ props, label }: { props: readonly string[]; label: string }) {
  const rig = useRig()
  const state = rig.keyState(props)
  const at = `${rig.currentTime.toFixed(2)}s`
  const title =
    state === 'key'
      ? `Retirer la keyframe de ${label} à ${at}`
      : state === 'animated'
        ? `Ajouter une keyframe de ${label} à ${at}`
        : `Animer ${label} : première keyframe à ${at}`

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={state === 'key'}
      onClick={() => rig.toggleKeysAtPlayhead(props)}
      // Cible de 32 px pour un dessin de 14 : on vise une ligne de réglage,
      // pas un pixel.
      className="-my-1 -mr-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-full
                 transition duration-[120ms] ease-out hover:bg-panel-row active:scale-[0.92]
                 motion-reduce:transition-none"
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className={
          'h-3.5 w-3.5 overflow-visible ' +
          (state === 'key'
            ? 'fill-action stroke-action'
            : state === 'animated'
              ? 'fill-none stroke-action'
              : 'fill-none stroke-ink-soft opacity-60')
        }
        strokeWidth={1.75}
        strokeLinejoin="round"
      >
        <path d="M8 1.5 14.5 8 8 14.5 1.5 8Z" />
      </svg>
    </button>
  )
}
