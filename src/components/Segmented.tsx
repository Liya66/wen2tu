import { useId } from 'react'

interface Option<T extends string | number> {
  value: T
  label: string
}

interface Props<T extends string | number> {
  label: string
  value: T | undefined
  options: Option<T>[]
  onChange: (value: T) => void
}

/** A row of mutually exclusive buttons (radio group semantics). */
export function Segmented<T extends string | number>({ label, value, options, onChange }: Props<T>) {
  const id = useId()
  return (
    <div className="segmented-field">
      <span className="field-label" id={id}>
        {label}
      </span>
      <div className="segmented" role="radiogroup" aria-labelledby={id}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
