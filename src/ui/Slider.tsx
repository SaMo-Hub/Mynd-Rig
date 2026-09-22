/**
 * Curseur de réglage — port web de `PanelSlider` (app iOS) : piste de 6 px au
 * lavis `panelRow`, part réglée en `action`, poignée pilule 22 × 10 blanche à
 * l'ombre douce. La zone tactile fait 28 px de haut alors que le visuel en
 * fait 10, comme sur iOS (HIG).
 *
 * Reste un `<input type="range">` natif : clavier, VoiceOver et glissé viennent
 * gratuitement ; seul l'habillage est repris (`::-webkit-slider-thumb`, cf.
 * `slider.css`).
 */
import './slider.css'

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
  // Part réglée : la piste est peinte au dégradé plutôt qu'en deux éléments
  // (une seule boîte à animer, pas de reflow au glissé).
  const pct = ((value - min) / (max - min)) * 100

  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
        <span className="text-ink-soft">{label}</span>
        <span className="font-mono text-text-primary">
          {value.toFixed(step < 1 ? 2 : 0)}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        className="mynd-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ '--fill': `${pct}%` } as React.CSSProperties}
      />
    </label>
  )
}
