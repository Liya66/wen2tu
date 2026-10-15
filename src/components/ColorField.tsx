import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toHexColor } from '../features/appearance/nodeStyles'

const SWATCHES = [
  '#1f2937',
  '#ffffff',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#fef3c7',
]

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
