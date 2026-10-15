import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

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

const GAP = 4
const MARGIN = 8

/**
 * A button that opens a small list of actions. Arrow keys move between items.
 * The list is rendered at the document root with fixed positioning, so
 * scrolling or clipping containers (like the toolbar) can't cut it off.
 */
export function Menu({ label, icon, items, showLabel = true, align = 'start' }: Props) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const menuId = useId()

  // Place the list under the button, keeping it inside the viewport.
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const button = buttonRef.current?.getBoundingClientRect()
      const list = listRef.current?.getBoundingClientRect()
      if (!button || !list) return
      let left = align === 'end' ? button.right - list.width : button.left
      left = Math.max(MARGIN, Math.min(left, window.innerWidth - list.width - MARGIN))
      let top = button.bottom + GAP
      if (top + list.height > window.innerHeight - MARGIN) top = Math.max(MARGIN, button.top - GAP - list.height)
      setPosition({ top, left })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open, align])

  useEffect(() => {
    if (!open) return
    const dismiss = () => {
      setOpen(false)
      setPosition(null)
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!listRef.current?.contains(target) && !buttonRef.current?.contains(target)) dismiss()
    }
    // Any scroll moves the button away from the fixed list; just close it.
    const onScroll = (event: Event) => {
      if (!listRef.current?.contains(event.target as Node)) dismiss()
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  useEffect(() => {
    if (open && position) listRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [open, position])

  const close = (refocus: boolean) => {
    setOpen(false)
    setPosition(null)
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
      close(true)
    }
  }

  return (
    <div className="menu">
      <button
        ref={buttonRef}
        type="button"
        className="tool-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={showLabel ? undefined : label}
        title={label}
        onClick={() => {
          setPosition(null)
          setOpen((value) => !value)
        }}
      >
        {icon}
        {showLabel && <span className="tool-label">{label}</span>}
      </button>
      {open &&
        createPortal(
          <ul
            id={menuId}
            ref={listRef}
            role="menu"
            aria-label={label}
            className="menu-list"
            style={position ?? { top: 0, left: 0, visibility: 'hidden' }}
            onKeyDown={onListKeyDown}
          >
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
          </ul>,
          document.body,
        )}
    </div>
  )
}
