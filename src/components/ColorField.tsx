import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toHexColor } from '../features/appearance/nodeStyles'

// Logo colors (ink, white, blossom, carrot, leaf, pebble, cream) plus red and yellow.
// Nine swatches, the optional "default" and the picker fit on one row.
const SWATCHES = ['#2c2d35', '#ffffff', '#fc9e9f', '#ff9341', '#77b26c', '#a7a6a9', '#fdeccd', '#e5484d', '#f5c542']

interface Props {
  label: string
  /** Current color, or undefined when the theme default is used. */
  value: string | undefined
  /** Shown in the picker when there is no value. */
  fallback: string
  /** Called continuously while dragging in the picker; should be cheap. */
  onPreview?: (color: string) => void
  /** Called once the user settles on a color, or with undefined to clear it. */
  onCommit: (color: string | undefined) => void
  clearLabel?: string
}

/**
 * Swatches plus the system color picker. Dragging in the picker only previews
 * (no re-layout, no undo step); the color is committed when the picker closes.
 */
export function ColorField({ label, value, fallback, onPreview, onCommit, clearLabel }: Props) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const commitRef = useRef(onCommit)

  useEffect(() => {
    commitRef.current = onCommit
  })

  // React's onChange fires on every input event; the native change event
  // fires once, when the picker is closed.
  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    const onChange = () => commitRef.current(input.value)
    input.addEventListener('change', onChange)
    return () => input.removeEventListener('change', onChange)
  }, [])

  const hex = toHexColor(value, fallback)

  return (
    <div className="color-field" role="group" aria-label={label}>
      <span className="field-label">{label}</span>
      <div className="color-row">
        {clearLabel && (
          <button
            type="button"
            className="swatch swatch-default"
            aria-pressed={value === undefined}
            onClick={() => onCommit(undefined)}
            title={clearLabel}
          >
            <span className="visually-hidden">{clearLabel}</span>
          </button>
        )}
        {SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            className="swatch"
            style={{ background: color }}
            aria-pressed={value !== undefined && toHexColor(value) === color}
            aria-label={color}
            title={color}
            onClick={() => onCommit(color)}
          />
        ))}
        <label className="swatch swatch-picker" title={t('style.pickColor')}>
          <span className="visually-hidden">
            {label}: {t('style.pickColor')}
          </span>
          <input
            ref={inputRef}
            type="color"
            value={hex}
            onChange={(event) => onPreview?.(event.target.value)}
          />
        </label>
      </div>
    </div>
  )
}
