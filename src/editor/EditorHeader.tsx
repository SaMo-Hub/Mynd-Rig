import { useRig } from './useRig'
import { MyndWordmark } from '../ui/MyndWordmark'
import { ThemeToggle } from '../ui/ThemeToggle'
import { GlassSegmented } from '../ui/GlassSegmented'
import { Button } from '../ui/Button'
import { IconDownload, IconPose, IconRig } from '../ui/icons'

/**
 * En-tête, calqué sur `HomeHeader` (app iOS) : le titre du lieu, son sous-titre,
 * puis les contrôles rangés à droite.
 *
 * Cotes reprises du design de la Home — titre **28 px bold**, `tracking -1,12` ;
 * sous-titre **16 px medium**, `tracking -0,64`, à **50 % d'opacité de l'encre**
 * (et non une couleur grise : le sous-titre suit ainsi le dark mode avec le
 * titre) ; **16** entre le bloc de titre et le sélecteur.
 *
 * Y vivent les décisions qui portent sur le **document** : dans quel mode on
 * l'édite, sous quel thème on le regarde, et son export. Les outils de pose,
 * eux, sont sur la scène.
 */
export function EditorHeader() {
  const rig = useRig()

  const exportJSON = () => {
    const blob = new Blob([rig.toJSON()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'mynd-animation.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <MyndWordmark className="h-6 w-auto shrink-0 text-action md:h-7" />

      {/* Sous un cadre étroit — l'éditeur vit en iframe — le titre cède la place
          aux contrôles : c'est avec eux qu'on travaille. */}
      <div className="hidden min-w-0 sm:block">
        <h1 className="text-[20px] font-bold leading-tight tracking-[-0.8px] text-text-primary md:text-[28px] md:tracking-[-1.12px]">
          Ton personnage
        </h1>
        <p className="hidden text-[16px] font-medium tracking-[-0.64px] text-text-primary/50 lg:block">
          Pose-le, rigge-le, fais-le marcher
        </p>
      </div>

      <div className="ml-auto flex items-center gap-2 md:gap-3">
        <GlassSegmented
          className="w-[184px] md:w-[248px]"
          label="Mode d’édition"
          value={rig.mode}
          onChange={(m) => rig.setMode(m)}
          segments={[
            {
              value: 'pose',
              label: 'Poser',
              icon: IconPose,
              title: 'Bouger et pivoter les membres et le corps',
            },
            {
              value: 'rig',
              label: 'Rigger',
              icon: IconRig,
              title: 'Déplacer les points d’attache (épaules / hanches)',
            },
          ]}
        />

        <ThemeToggle />

        <Button
          variant="primary"
          onClick={exportJSON}
          title="Exporter l’animation en JSON"
          aria-label="Sauvegarder"
          className="!px-4 md:!px-[18px]"
        >
          <IconDownload />
          <span className="hidden md:inline">Sauvegarder</span>
        </Button>
      </div>
    </header>
  )
}
