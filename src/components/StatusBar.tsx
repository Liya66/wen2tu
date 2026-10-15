import { AlertCircle, CheckCircle2, CircleDot, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ActiveDoc } from '../features/workspace/workspaceController'
import { REPO_URL } from '../config'
import { shortcut } from '../utils/platform'

/** Describes where the current content is saved, in words that never overstate it. */
function useStatusText(active: ActiveDoc | null): string {
  const { t } = useTranslation()
  if (!active) return ''
  switch (active.saveState) {
    case 'saving':
      return t('status.saving')
    case 'error':
      return t('status.error')
    case 'saved':
      if (active.linked) return t('status.savedFile', { file: active.fileName })
      return t('status.downloadedClean')
    case 'dirty':
      if (active.linked) return t('status.dirty')
      if (!active.hasSavedCopy) return t('status.draft')
      return t('status.downloadedDirty')
  }
}

interface Props {
  active: ActiveDoc | null
  fileSystemAccess: boolean
  autoWrite: boolean
}

export function StatusBar({ active, fileSystemAccess, autoWrite }: Props) {
  const { t } = useTranslation()
  const text = useStatusText(active)
  const state = active?.saveState

  const icon =
    state === 'saving' ? (
      <Loader2 size={14} className="spin" aria-hidden="true" />
    ) : state === 'error' ? (
      <AlertCircle size={14} aria-hidden="true" />
    ) : state === 'saved' ? (
      <CheckCircle2 size={14} aria-hidden="true" />
    ) : (
      <CircleDot size={14} aria-hidden="true" />
    )

  return (
    <footer className="statusbar">
      <div className="status" data-state={state} role="status" aria-live="polite" data-testid="save-status">
        {icon}
        <span>{text}</span>
        {active?.needsPermission && (
          <span className="status-hint">· {t('status.needsPermission', { shortcut: shortcut('S') })}</span>
        )}
        {autoWrite && active?.linked && <span className="status-hint">· {t('status.autoWriteOn')}</span>}
      </div>
      <div className="status-meta">
        {!fileSystemAccess && <span className="status-hint">{t('status.fallbackMode')}</span>}
        <span className="status-hint privacy">{t('footer.privacy')}</span>
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
          {t('footer.source')}
        </a>
      </div>
    </footer>
  )
}
