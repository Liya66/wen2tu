import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { shortcut } from '../utils/platform'
import { Dialog } from './Dialog'

interface Props {
  open: boolean
  onClose: () => void
  /** Resolves true when a map was created. */
  onCreate: (text: string) => Promise<boolean>
}

/** Paste Markdown (e.g. from an AI chat) to create a map, and copy a prompt that asks for that format. */
export function PasteDialog({ open, onClose, onCreate }: Props) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)

  const close = () => {
    setText('')
    setCopied(false)
    onClose()
  }

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(t('paste.prompt'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Dialog
      open={open}
      title={t('paste.title')}
      onClose={close}
      onSubmit={() => {
        if (!text.trim()) return
        void onCreate(text).then((created) => created && close())
      }}
      actions={
        <>
          <button type="button" className="button paste-copy" onClick={() => void copyPrompt()} aria-live="polite">
            {copied ? t('paste.copied') : t('paste.copyPrompt')}
          </button>
          <button type="button" className="button" onClick={close}>
            {t('dialogs.cancel')}
          </button>
          <button type="submit" className="button primary" disabled={!text.trim()}>
            {t('paste.create')}
          </button>
        </>
      }
    >
      <label className="field">
        <span>{t('paste.label')}</span>
        <textarea
          className="paste-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('paste.placeholder')}
          rows={10}
          autoFocus
          spellCheck={false}
        />
      </label>
      <p className="dialog-hint">{t('paste.hint', { shortcut: shortcut('V') })}</p>
    </Dialog>
  )
}
