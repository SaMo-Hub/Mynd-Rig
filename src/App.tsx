import { RigCanvas } from './editor/RigCanvas'
import { Timeline } from './editor/Timeline'
import { SceneToolbar } from './editor/SceneToolbar'
import { SceneHint } from './editor/SceneHint'
import { ArticulationPanel } from './editor/ArticulationPanel'
import { EditorHeader } from './editor/EditorHeader'

/**
 * Éditeur de rig, dessiné sur la DA de l'accueil de l'app Mynd.
 *
 * Le principe de cette DA : **rien ne se détache par un trait**. Les zones sont
 * des cartes arrondies (`Radius.xl`) posées sur le fond, séparées par du vide et
 * de l'ombre douce ; les contrôles sont des capsules ; le seul contour de toute
 * la page est le liseré 2 px des boutons ronds, comme celui de la recherche sur
 * la Home. L'ancien découpage en bandeaux bordés — en-tête, barre, panneau,
 * timeline, tous collés et séparés par des `border-b` — a été abandonné pour ça.
 *
 * Le contenu est réparti par sujet, pas par commodité :
 * - l'**identité** et ce qui touche au document (mode, thème, export) en tête ;
 * - les outils de **pose** dans une capsule flottante posée sur la scène, à la
 *   manière de la barre d'action de l'éditeur de souvenir ;
 * - le **temps** (transport, durée, keyframes) dans la carte Timeline ;
 * - les **réglages** d'articulation dans leur propre carte.
 */
function App() {
  return (
    <div className="flex h-screen flex-col gap-4 overflow-hidden bg-background p-5">
      <EditorHeader />

      <div className="relative flex min-h-0 flex-1 gap-4">
        {/* La scène : une carte, pas un cadre. Le canvas y est détouré par le
            rayon ; la capsule d'outils et l'indice flottent par-dessus. */}
        <section className="relative min-w-0 flex-1 overflow-hidden rounded-xl bg-stage shadow-card">
          <RigCanvas />
          <SceneHint />
          <SceneToolbar />
        </section>

        <ArticulationPanel />
      </div>

      <Timeline />
    </div>
  )
}

export default App
