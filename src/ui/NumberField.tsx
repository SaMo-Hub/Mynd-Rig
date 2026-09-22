/**
 * Champ numérique compact, sur le modèle du **champ de recherche de la Home**
 * (`HomeHeader.searchField`) et non du champ de formulaire : une **pilule
 * pleine** `surfaceElevated`, sans contour — la DA ne détache pas par un trait.
 * Le focus pose un anneau `action`, l'anneau de sélection de l'app.
 *
 * Le contour permanent de `MyndTextField` reste réservé aux vrais formulaires
 * plein écran, qu'on n'a pas ici.
 */
export function NumberField({
  label,
  value,
  min,
  step,
  suffix,
  onChange,
  className = '',
}: {
  label: string
  value: number
  min?: number
  step?: number
  suffix?: string
  onChange: (v: number) => void
  className?: string
}) {
  return (
    <label className={'flex items-center gap-2 ' + className}>
      <span className="text-[13px] font-semibold text-ink-soft">{label}</span>
      <span
        className="flex h-11 items-center gap-1 rounded-full bg-surface-elevated px-4
                   ring-inset transition duration-[120ms] ease-out
                   focus-within:ring-2 focus-within:ring-action motion-reduce:transition-none"
      >
        <input
          type="number"
          min={min}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || (min ?? 0))}
          className="w-12 bg-transparent text-[15px] font-semibold text-text-primary outline-none"
        />
        {suffix && <span className="text-[13px] text-ink-soft">{suffix}</span>}
      </span>
    </label>
  )
}
