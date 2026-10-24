import { useEffect, useReducer, useState } from 'react'
import { useRig } from './useRig'
import { LIMBS } from '../rig/rigData'
import type { LimbStyle } from '../rig/animations'
import { ELEMENT_BY_ID, bendProp, curveProp, posProp } from './tracks'
import { KeyToggle } from './KeyToggle'
import { Slider } from '../ui/Slider'
import { Checkbox } from '../ui/Checkbox'
import { Button } from '../ui/Button'
import { GlassSegmented } from '../ui/GlassSegmented'
import { IconButton } from '../ui/IconButton'
import { IconChevron } from '../ui/icons'
import { useMediaQuery } from '../ui/useMediaQuery'

/** Rafraîchissement du panneau pendant la lecture (les valeurs y sont animées). */
const PLAYBACK_REFRESH_MS = 66

/**
 * Réglages d'articulation, en **carte** posée à droite de la scène.
 *
 * Plus de bandeau bordé ni de rangées séparées par des traits : un titre, des
 * blocs espacés, et un fond `surfaceElevated` pour regrouper les réglages d'un
 * membre — la même façon qu'ont les panneaux de l'app de distinguer leurs
 * rangées par un lavis plutôt que par une bordure.
 *
 * Chaque réglage animable porte son bouton keyframe (`KeyToggle`) : c'est la
 * voie directe pour animer une rondeur ou une rotation sans passer par
 * l'auto-keyframe.
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

  // Pendant la lecture, le store n'émet rien (Pixi lit la pose en direct) :
  // sans ce battement, rondeur et rotation animées resteraient figées ici.
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!rig.playing || !open) return
    const id = window.setInterval(tick, PLAYBACK_REFRESH_MS)
    return () => window.clearInterval(id)
  }, [rig.playing, open])

  // Un élément sélectionné sur la scène (extrémité, attache, disque du corps,
  // regard) : le panneau ne montre plus que ses propriétés.
  const element = rig.selected ? ELEMENT_BY_ID[rig.selected] : undefined

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

      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-4">
        {element ? <ElementView id={element.id} /> : <Overview />}
      </div>
    </aside>
  )
}

/** Vue d'ensemble : la forme des 4 membres, liée ou membre par membre. */
function Overview() {
  const rig = useRig()
  const keys = LIMBS.map((l) => l.key)

  return (
    <>
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
        <div className="mt-5">
          <StyleControls limbs={keys} onChange={(p) => rig.setAllStyle(p)} />
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {LIMBS.map((l) => (
            <div key={l.key} className="rounded-lg bg-surface-elevated p-4">
              {/* Le nom sélectionne le membre : sa poignée s'allume sur la
                  scène et le panneau ne montre plus que lui. */}
              <button
                type="button"
                onClick={() => rig.select(l.key)}
                className="-mx-2 -mt-1 mb-2 flex min-h-11 items-center gap-1 rounded-full px-2
                           text-[14px] font-semibold text-text-primary
                           hover:bg-panel-row"
              >
                {l.label}
                <IconChevron className="h-3.5 w-3.5 text-ink-soft" />
              </button>
              <StyleControls limbs={[l.key]} onChange={(p) => rig.setLimbStyle(l.key, p)} />
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/** Les propriétés d'un seul élément, quand il est sélectionné sur la scène. */
function ElementView({ id }: { id: string }) {
  const rig = useRig()
  const element = ELEMENT_BY_ID[id]
  const isLimb = LIMBS.some((l) => l.key === id)

  return (
    <div>
      <button
        type="button"
        onClick={() => rig.select(null)}
        className="-ml-2 flex min-h-11 items-center gap-1 rounded-full pl-1 pr-3
                   text-[14px] font-semibold text-ink-blue hover:bg-panel-row"
      >
        <IconChevron className="h-4 w-4 rotate-180" />
        Vue d’ensemble
      </button>

      <div className="mt-3 rounded-lg bg-surface-elevated p-4">
        <div className="mb-4 text-[17px] font-bold tracking-[-0.5px] text-text-primary">
          {element.label}
        </div>

        {id === 'body' && (
          <div className="space-y-4">
            <PropRow
              label="Position"
              hint="Glisse le disque au centre du corps"
              props={['body.pos']}
            />
            <Slider
              label="Rotation"
              value={wrapDeg(rig.pose.bodyRot * (180 / Math.PI))}
              min={-180}
              max={180}
              step={1}
              suffix="°"
              accessory={<KeyToggle props={['body.rot']} label="la rotation du corps" />}
              onChange={(v) => rig.setBodyRotDeg(v)}
            />
          </div>
        )}

        {id === 'gaze' && (
          <PropRow label="Position" hint="Glisse la pastille entre les yeux" props={['gaze.pos']} />
        )}

        {isLimb && (
          <div className="space-y-4">
            {/* La rotation est celle de l'extrémité autour de l'attache : elle
                écrit la position du membre, d'où le bouton keyframe partagé. */}
            <Slider
              label="Rotation"
              value={Math.round(rig.limbAngle(id))}
              min={-180}
              max={180}
              step={1}
              suffix="°"
              accessory={<KeyToggle props={[posProp(id)]} label={`la position (${element.label})`} />}
              onChange={(v) => rig.setLimbAngle(id, v)}
            />
            <StyleControls limbs={[id]} onChange={(p) => rig.setLimbStyle(id, p)} />
          </div>
        )}
      </div>

      {isLimb && (
        <>
          <p className="mt-3 px-1 text-[13px] text-ink-soft">
            {rig.styleLinked
              ? 'Forme commune aux 4 membres — la modifier ici la rend propre à ce membre.'
              : 'Forme propre à ce membre.'}
          </p>
          {!rig.styleLinked && (
            <Button variant="ghost" className="mt-1" onClick={() => rig.applyStyleToAll(id)}>
              Appliquer aux 4 membres
            </Button>
          )}
        </>
      )}
    </div>
  )
}

/** Propriété sans curseur (une position, qui se règle sur la scène). */
function PropRow({ label, hint, props }: { label: string; hint: string; props: string[] }) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <div className="flex-1">
        <div className="text-ink-soft">{label}</div>
        <div className="text-[12px] text-meta-ink">{hint}</div>
      </div>
      <KeyToggle props={props} label={label.toLowerCase()} />
    </div>
  )
}

/**
 * Forme des membres : rondeur et rotation du pli (animables), étirement
 * (réglage). `limbs` : un membre, ou les 4 en mode lié — la valeur affichée
 * est alors celle du premier.
 */
function StyleControls({
  limbs,
  onChange,
}: {
  limbs: string[]
  onChange: (partial: Partial<LimbStyle>) => void
}) {
  const rig = useRig()
  const shape = rig.pose.shape[limbs[0]]
  const who = limbs.length > 1 ? 'des 4 membres' : `(${ELEMENT_BY_ID[limbs[0]].label})`

  return (
    <div className="space-y-4">
      <Slider
        label="Rondeur"
        value={shape.curve}
        min={0}
        max={2}
        step={0.05}
        accessory={<KeyToggle props={limbs.map(curveProp)} label={`la rondeur ${who}`} />}
        onChange={(v) => onChange({ curve: v })}
      />
      <Slider
        label="Rotation du pli"
        value={shape.bendDeg}
        min={0}
        max={180}
        step={1}
        suffix="°"
        accessory={<KeyToggle props={limbs.map(bendProp)} label={`la rotation du pli ${who}`} />}
        onChange={(v) => onChange({ bendDeg: v })}
      />
      <Checkbox
        label="Autoriser l'étirement"
        checked={rig.stretch[limbs[0]]}
        onChange={(v) => onChange({ stretch: v })}
      />
    </div>
  )
}

/** Un angle ramené dans [-180°, 180°[ pour le curseur. */
function wrapDeg(d: number): number {
  return Math.round(((((d + 180) % 360) + 360) % 360) - 180)
}
