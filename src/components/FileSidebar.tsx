import { FileText, HardDrive, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { DocSummary, WorkspaceController } from '../features/workspace/workspaceController'

interface Props {
  controller: WorkspaceController
  docs: DocSummary[]
  activeId: string | null
  open: boolean
  onSelect: (doc: DocSummary) => void
  onRename: (doc: DocSummary) => void
  onRemove: (doc: DocSummary) => void
}

export function FileSidebar({ controller, docs, activeId, open, onSelect, onRename, onRemove }: Props) {
  const { t } = useTranslation()

  return (
    <aside id="file-sidebar" className="sidebar" data-open={open} aria-label={t('sidebar.title')}>
      <div className="sidebar-header">
        <h2>{t('sidebar.title')}</h2>
        <button
          type="button"
          className="icon-button"
          onClick={() => controller.newDoc()}
          aria-label={t('toolbar.new')}
          title={t('toolbar.new')}
        >
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>

      <ul className="doc-list">
        {docs.map((doc) => {
          const active = doc.id === activeId
          const kind = doc.linked ? t('sidebar.linked') : t('sidebar.draft')
          return (
            <li key={doc.id} className="doc-item" data-active={active}>
              <button
                type="button"
                className="doc-open"
                aria-current={active ? 'true' : undefined}
                onClick={() => onSelect(doc)}
                title={`${doc.title} · ${kind}${doc.dirty ? ` · ${t('sidebar.unsaved')}` : ''}`}
              >
                {doc.linked ? (
                  <HardDrive size={15} aria-hidden="true" />
                ) : (
                  <FileText size={15} aria-hidden="true" />
                )}
                <span className="doc-title">{doc.title}</span>
                <span className="visually-hidden">
                  {kind}
                  {doc.dirty ? `, ${t('sidebar.unsaved')}` : ''}
                </span>
                {doc.dirty && <span className="dirty-dot" aria-hidden="true" />}
              </button>
              <div className="doc-actions">
                {!doc.linked && (
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => onRename(doc)}
                    aria-label={`${t('sidebar.rename')}: ${doc.title}`}
                    title={t('sidebar.rename')}
                  >
                    <Pencil size={14} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => onRemove(doc)}
                  aria-label={`${t('sidebar.remove')}: ${doc.title}`}
                  title={t('sidebar.remove')}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <p className="sidebar-note">{t('sidebar.storedInBrowser')}</p>
    </aside>
  )
}
