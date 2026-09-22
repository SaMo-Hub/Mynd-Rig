import { useEffect, useState } from 'react'
import { useRig } from './useRig'
import { LIMBS } from '../rig/rigData'
import { Slider } from '../ui/Slider'
import { Checkbox } from '../ui/Checkbox'
import { GlassSegmented } from '../ui/GlassSegmented'
import { IconButton } from '../ui/IconButton'
import { IconChevron } from '../ui/icons'
import { useMediaQuery } from '../ui/useMediaQuery'

/**
 * Réglages d'articulation, en **carte** posée à droite de la scène.
 *
 * Plus de bandeau bordé ni de rangées séparées par des traits : un titre, des
 * blocs espacés, et un fond `surfaceElevated` pour regrouper les réglages d'un
 * membre — la même façon qu'ont les panneaux de l'app de distinguer leurs
 * rangées par un lavis plutôt que par une bordure.
 */
export function ArticulationPanel() {
  const rig = useRig()
  // Le panneau coûte 320 px : dans un cadre étroit — l'éditeur vit en iframe —
  // il ne laisserait plus rien à la scène. Il s'ouvre donc de lui-même à partir
  // de `lg`, mais un choix explicite de l'utilisateur prime, jusqu'au prochain
  // franchissement de seuil.
  const wide = useMediaQuery('(min-width: 1024px)')
  const [override, setOverride] = useState<boolean | null>(null)
  const open = override ?? wide

  useEffect(() => setOverride(null), [wide])

  // Valeur représentative en mode lié (celle du 1er membre).
  const ref = rig.limbStyle[LIMBS[0].key]

  if (!open) {
    return (
      <aside className="absolute right-3 top-3 z-30 lg:static lg:flex lg:shrink-0 lg:items-start">
        <IconButton label="Ouvrir les réglages d’articulation" onClick={() => setOverride(true)}>
          <IconChevron className="h-4 w-4 rotate-180" />
        </IconButton>
      </aside>
    )
  }

  return (
    <aside
      className="absolute inset-y-0 right-0 z-30 flex w-80 max-w-[calc(100%-1rem)] shrink-0
                 flex-col overflow-hidden rounded-xl bg-surface shadow-float
                 lg:static lg:z-auto lg:max-w-none lg:shadow-card"
    >
      <div className="flex items-center gap-2 px-5 pt-5">
        <h2 className="flex-1 text-[20px] font-bold tracking-[-0.8px] text-text-primary">
          Articulations
        </h2>
        <IconButton label="Réduire le panneau" size={36} onClick={() => setOverride(false)}>
          <IconChevron className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5 pt-4">
        {/* Portée des réglages : deux états exclusifs, donc le même sélecteur
            que le mode d'édition — un seul composant pour ce geste. */}
        <GlassSegmented
          label="Portée des réglages"
          value={rig.styleLinked ? 'linked' : 'each'}
          onChange={(v) => rig.setStyleLinked(v === 'linked')}
          segments={[
            { value: 'linked', label: 'Liés', title: 'Un réglage commun aux 4 membres' },
            { value: 'each', label: 'Séparés', title: 'Régler chaque membre séparément' },
          ]}
        />

        {rig.styleLinked ? (
          <div className="mt-5 space-y-5">
            <Slider
              label="Rondeur"
              value={ref.curve}
              min={0}
              max={2}
              step={0.05}
              onChange={(v) => rig.setAllStyle({ curve: v })}
            />
            <Slider
              label="Rotation du pli"
              value={ref.bendDeg}
              min={0}
              max={180}
              step={1}
              suffix="°"
              onChange={(v) => rig.setAllStyle({ bendDeg: v })}
            />
            <Checkbox
              label="Autoriser l'étirement"
              checked={ref.stretch}
              onChange={(v) => rig.setAllStyle({ stretch: v })}
            />
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {LIMBS.map((l) => {
              const st = rig.limbStyle[l.key]
              return (
                <div key={l.key} className="rounded-lg bg-surface-elevated p-4">
                  <div className="mb-3 text-[14px] font-semibold text-text-primary">{l.label}</div>
                  <div className="space-y-4">
                    <Slider
                      label="Rondeur"
                      value={st.curve}
                      min={0}
                      max={2}
                      step={0.05}
                      onChange={(v) => rig.setLimbStyle(l.key, { curve: v })}
                    />
                    <Slider
                      label="Rotation du pli"
                      value={st.bendDeg}
                      min={0}
                      max={180}
                      step={1}
                      suffix="°"
                      onChange={(v) => rig.setLimbStyle(l.key, { bendDeg: v })}
                    />
                    <Checkbox
                      label="Autoriser l'étirement"
                      checked={st.stretch}
                      onChange={(v) => rig.setLimbStyle(l.key, { stretch: v })}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}
