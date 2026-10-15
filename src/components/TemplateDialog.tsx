import { useTranslation } from 'react-i18next'
import { TEMPLATES, type MapTemplate } from '../features/appearance/templates'
import { findPreset, systemTheme } from '../features/appearance/themes'
import { Dialog } from './Dialog'

interface Props {
  open: boolean
  onClose: () => void
  onPick: (template: MapTemplate) => void
}

export function TemplateDialog({ open, onClose, onPick }: Props) {
  const { t } = useTranslation()
  const prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches

  return (
    <Dialog
      open={open}
      title={t('templates.title')}
      onClose={onClose}
      wide
      actions={
        <button type="button" className="button" onClick={onClose}>
          {t('dialogs.cancel')}
        </button>
      }
    >
      <div className="template-grid">
        {TEMPLATES.map((template) => {
          const theme = (template.theme && findPreset(template.theme)) || systemTheme(prefersDark)
          return (
            <button
              key={template.id}
              type="button"
              className="template-card"
              onClick={() => onPick(template)}
              data-testid={`template-${template.id}`}
            >
              <span className="template-preview" style={{ background: theme.cssVar['--bgcolor'] }} aria-hidden="true">
                <span
                  className="template-root"
                  style={{ background: theme.cssVar['--root-bgcolor'], color: theme.cssVar['--root-color'] }}
                />
                {theme.palette.slice(0, 4).map((color, index) => (
                  <span key={color} className={`template-branch b${index}`} style={{ background: color }} />
                ))}
              </span>
              <span className="template-name">{t(`templates.${template.id}.name`)}</span>
              <span className="template-description">{t(`templates.${template.id}.description`)}</span>
            </button>
          )
        })}
      </div>
    </Dialog>
  )
}
