/**
 * Curseur de réglage d'un panneau : libellé et valeur au-dessus, `FluidSlider`
 * (le `UISlider` d'iOS 26 à plat — ressorts, inertie, élastique) en dessous.
 *
 * Le libellé est posé en `aria-label` sur le curseur lui-même : ce n'est plus un
 * `<input>`, un `<label>` englobant ne le nommerait pas.
 */
import { FluidSlider } from './FluidSlider'

export function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-ink-soft">{label}</span>
        <span className="font-mono text-text-primary">
          {value.toFixed(step < 1 ? 2 : 0)}
          {suffix}
        </span>
      </div>
      <FluidSlider label={label} value={value} min={min} max={max} step={step} onChange={onChange} />
    </div>
  )
}
