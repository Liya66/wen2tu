import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export interface MenuItem {
  label: string
  onSelect: () => void
  /** Renders a checkbox item when defined. */
  checked?: boolean
  disabled?: boolean
  hint?: string
}

interface Props {
  label: string
  icon: ReactNode
  items: MenuItem[]
  showLabel?: boolean
  align?: 'start' | 'end'
}

/** A button that opens a small list of actions. Arrow keys move between items. */
export function Menu({ label, icon, items, showLabel = true, align = 'start' }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    listRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  const onListKeyDown = (event: KeyboardEvent) => {
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      buttons[(index + 1) % buttons.length]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      buttons[(index - 1 + buttons.length) % buttons.length]?.focus()
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div className="menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="tool-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={showLabel ? undefined : label}
        title={label}
        onClick={() => setOpen((value) => !value)}
      >
        {icon}
        {showLabel && <span className="tool-label">{label}</span>}
      </button>
      {open && (
        <ul id={menuId} ref={listRef} role="menu" className={`menu-list menu-${align}`} onKeyDown={onListKeyDown}>
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                type="button"
                role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={item.checked}
                disabled={item.disabled}
                onClick={() => {
                  close(true)
                  item.onSelect()
                }}
              >
                {item.checked !== undefined && (
                  <span className="menu-check" aria-hidden="true">
                    {item.checked ? '✓' : ''}
                  </span>
                )}
                <span>
                  {item.label}
                  {item.hint && <small className="menu-hint">{item.hint}</small>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
