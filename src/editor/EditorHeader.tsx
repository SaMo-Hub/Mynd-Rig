import { useEffect, useState } from 'react'
import { useRig } from './useRig'
import { OPEN_FAILED_EVENT, exportDocument, openDocument } from './documentIO'
import { MyndWordmark } from '../ui/MyndWordmark'
import { ThemeToggle } from '../ui/ThemeToggle'
import { GlassSegmented } from '../ui/GlassSegmented'
import { Button } from '../ui/Button'
import { mod } from '../ui/keys'
import { IconDownload, IconPose, IconRedo, IconRig, IconUndo, IconUpload, IconWarning } from '../ui/icons'

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
 * l'édite, sous quel thème on le regarde, son historique (annuler /
 * rétablir), son ouverture et son export. Les outils de pose, eux, sont sur la
 * scène.
 */
export function EditorHeader() {
  const rig = useRig()
  const [openFailed, setOpenFailed] = useState(false)

  // L'ouverture peut venir d'ici ou du raccourci : l'échec passe par un événement.
  useEffect(() => {
    const onFail = () => setOpenFailed(true)
    window.addEventListener(OPEN_FAILED_EVENT, onFail)
    return () => window.removeEventListener(OPEN_FAILED_EVENT, onFail)
  }, [])

  useEffect(() => {
    if (!openFailed) return
    const id = window.setTimeout(() => setOpenFailed(false), 5000)
    return () => window.clearTimeout(id)
  }, [openFailed])

  const open = () => {
    setOpenFailed(false)
    void openDocument()
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

      {/* L'historique vit près du titre du document, comme dans un éditeur de
          texte — et, dans un cadre étroit, sur la ligne du logo : c'est là
          qu'il reste de la place quand les contrôles passent à la ligne. */}
      <div className="flex items-center max-sm:ml-auto">
        <Button
          variant="ghost"
          size="icon"
          disabled={!rig.canUndo}
          onClick={() => rig.undo()}
          title={`Annuler (${mod('Z')})`}
          aria-label="Annuler"
        >
          <IconUndo />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={!rig.canRedo}
          onClick={() => rig.redo()}
          title={`Rétablir (⇧${mod('Z')})`}
          aria-label="Rétablir"
        >
          <IconRedo />
        </Button>
      </div>

      <div className="ml-auto flex items-center gap-2 md:gap-3">
        {openFailed && (
          // Icône + texte : jamais la couleur seule. Annoncé aux lecteurs d'écran.
          <p role="status" className="flex items-center gap-1.5 text-[13px] font-semibold text-destructive">
            <IconWarning className="h-4 w-4 shrink-0" />
            <span className="max-md:hidden">Ce fichier n’est pas une animation Mynd</span>
          </p>
        )}

        <GlassSegmented
          className="w-[168px] sm:w-[184px] md:w-[248px]"
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
          variant="ghost"
          size="icon"
          onClick={open}
          title={`Ouvrir une animation exportée (${mod('O')})`}
          aria-label="Ouvrir"
        >
          <IconUpload />
        </Button>

        <Button
          variant="primary"
          onClick={exportDocument}
          title={`Exporter l’animation en JSON (${mod('S')})`}
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
