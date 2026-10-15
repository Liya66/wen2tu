import { useEffect, useId, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  title: string
  onClose: () => void
  children?: ReactNode
  actions: ReactNode
  /** Rendered as a form so Enter submits; receives the submit event. */
  onSubmit?: () => void
  /** Wider dialog for galleries. */
  wide?: boolean
}

/** Modal dialog built on the native <dialog> element (focus trap and Escape for free). */
export function Dialog({ open, title, onClose, children, actions, onSubmit, wide }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
    }
  }, [open])

  const body = (
    <>
      <h2 id={titleId} className="dialog-title">
        {title}
      </h2>
      <div className="dialog-body">{children}</div>
      <div className="dialog-actions">{actions}</div>
    </>
  )

  return (
    <dialog
      ref={ref}
      className={wide ? 'dialog dialog-wide' : 'dialog'}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      {open &&
        (onSubmit ? (
          <form
            method="dialog"
            onSubmit={(event) => {
              event.preventDefault()
              onSubmit()
            }}
          >
            {body}
          </form>
        ) : (
          body
        ))}
    </dialog>
  )
}
