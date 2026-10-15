import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Notice, WorkspaceController } from '../features/workspace/workspaceController'

interface Props {
  notices: Notice[]
  controller: WorkspaceController
}

export function NoticeArea({ notices, controller }: Props) {
  const { t } = useTranslation()
  if (!notices.length) return null

  const render = (notice: Notice): { text: ReactNode; tone: 'info' | 'warning' | 'error'; actions?: ReactNode } => {
    switch (notice.kind) {
      case 'recovered':
        return {
          tone: 'info',
          text: t('notices.recovered'),
          actions: (
            <>
              <button type="button" className="button" onClick={() => controller.dismissNotice(notice.id)}>
                {t('notices.recoveredKeep')}
              </button>
              <button type="button" className="button" onClick={() => controller.revertToSaved(notice.docId)}>
                {t('notices.recoveredDiscard')}
              </button>
            </>
          ),
        }
      case 'external-change':
        return {
          tone: 'warning',
          text: t('notices.externalChange'),
          actions: (
            <>
              <button
                type="button"
                className="button"
                onClick={() => void controller.resolveExternalChange(notice.id, 'reload')}
              >
                {t('notices.externalReload')}
              </button>
              <button
                type="button"
                className="button"
                onClick={() => void controller.resolveExternalChange(notice.id, 'keep')}
              >
                {t('notices.externalKeep')}
              </button>
            </>
          ),
        }
      case 'downloaded':
        return { tone: 'info', text: t('notices.downloaded', { file: notice.fileName }) }
      case 'imported':
        return { tone: 'info', text: t('notices.imported', { file: notice.fileName }) }
      case 'storage-unavailable':
        return { tone: 'warning', text: t('notices.storageUnavailable') }
      case 'error':
        return {
          tone: 'error',
          text: (
            <>
              <strong>{t(notice.message.key, { defaultValue: t('errors.unknown') })}</strong>
              {notice.message.detail && (
                <span className="notice-detail">{t('errors.details', { detail: notice.message.detail })}</span>
              )}
            </>
          ),
        }
    }
  }

  return (
    <div className="notices">
      {notices.map((notice) => {
        const { text, tone, actions } = render(notice)
        return (
          <div
            key={notice.id}
            className="notice"
            data-tone={tone}
            role={tone === 'error' ? 'alert' : 'status'}
            data-testid={`notice-${notice.kind}`}
          >
            <div className="notice-text">{text}</div>
            {actions && <div className="notice-actions">{actions}</div>}
            <button
              type="button"
              className="icon-button"
              onClick={() => controller.dismissNotice(notice.id)}
              aria-label={t('notices.dismiss')}
              title={t('notices.dismiss')}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
