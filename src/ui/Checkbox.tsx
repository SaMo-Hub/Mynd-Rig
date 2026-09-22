/**
 * Case à cocher — port web de `NotesCheckbox` (app iOS), version « panneau » :
 * cercle vide qui se remplit d'`action`, **coche qui se trace** (`stroke-dashoffset`,
 * effet draw-on) avec ~50 ms de retard sur le remplissage.
 *
 * L'asymétrie d'Apple est conservée : cocher « pop » (ressort avec dépassement),
 * décocher est sec et sans rebond — on ne célèbre pas l'annulation.
 * Reduce Motion : simple fondu, sans scale ni tracé.
 */
export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 py-1.5 text-[13px] text-text-primary">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative grid h-[22px] w-[22px] shrink-0 place-items-center
                   peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2
                   peer-focus-visible:outline-action rounded-full"
      >
        {/* Décoché : contour seul. Coché : disque plein qui gicle du centre. */}
        <span className="absolute inset-0 rounded-full border-2 border-border" />
        <span
          className={
            'absolute inset-0 rounded-full bg-action transition-transform ' +
            'motion-reduce:transition-opacity ' +
            (checked
              ? 'scale-100 [transition:transform_340ms_cubic-bezier(0.34,1.56,0.64,1)]'
              : 'scale-50 opacity-0 [transition:transform_200ms_ease-out,opacity_200ms_ease-out]')
          }
        />
        <svg viewBox="0 0 22 22" className="relative h-[22px] w-[22px] text-mist">
          <path
            d="M6.5 11.3 9.6 14.4 15.5 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            style={{
              strokeDashoffset: checked ? 0 : 1,
              // Tracé quasi régulier : un ease-out avalerait les premiers 70 %
              // du trait, on ne verrait que la fin du geste.
              transition: checked
                ? 'stroke-dashoffset 300ms ease-in-out 50ms'
                : 'stroke-dashoffset 100ms ease-in',
            }}
          />
        </svg>
      </span>
      {label}
    </label>
  )
}
