import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TEMPLATES, templateOutline, templateShapes, type MapTemplate } from '../features/appearance/templates'
import type { Language } from '../i18n'
import { Dialog } from './Dialog'
import { ShapeIcon } from './ShapeIcon'
import { TemplatePreview } from './TemplatePreview'

interface Props {
  open: boolean
  language: Language
  onClose: () => void
  /** Create a map with the template's sample content. */
  onPick: (template: MapTemplate) => void
  /** Create a map from the user's outline in the template's look. Resolves true on success. */
  onApply: (template: MapTemplate, text: string) => Promise<boolean>
}

type Copied = 'prompt' | 'outline' | null

/**
 * Template gallery. Choosing a template opens its page: use the sample
 * content, or pour your own outline (e.g. an AI's answer) into its look.
 */
export function TemplateDialog({ open, language, onClose, onPick, onApply }: Props) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<MapTemplate | null>(null)
  const [text, setText] = useState('')
  const [copied, setCopied] = useState<Copied>(null)
  const prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches

  const close = () => {
    setSelected(null)
    setText('')
    setCopied(null)
    onClose()
  }

  const copy = async (kind: Exclude<Copied, null>, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      setTimeout(() => setCopied((current) => (current === kind ? null : current)), 2500)
    } catch {
      setCopied(null)
    }
  }

  const name = (template: MapTemplate) => t(`templates.${template.id}.name`)

  if (selected) {
    const outline = templateOutline(selected, language)
    const shapes = templateShapes(selected)
    return (
      <Dialog
        open={open}
        title={name(selected)}
        onClose={close}
        wide
        onSubmit={() => {
          if (!text.trim()) return
          void onApply(selected, text).then((done) => done && close())
        }}
        actions={
          <>
            <button type="button" className="button paste-copy" onClick={() => setSelected(null)}>
              <ArrowLeft size={14} aria-hidden="true" /> {t('templates.back')}
            </button>
            <button type="button" className="button" onClick={close}>
              {t('dialogs.cancel')}
            </button>
            <button type="submit" className="button primary" disabled={!text.trim()}>
              {t('templates.apply')}
            </button>
          </>
        }
      >
        <div className="template-detail">
          <div className="template-detail-preview">
            <TemplatePreview template={selected} prefersDark={prefersDark} />
          </div>
          <div className="template-detail-info">
            <p>{t(`templates.${selected.id}.description`)}</p>
            {shapes.length > 0 && (
              <ul className="template-shapes" aria-label={t('templates.shapesUsed')}>
                {shapes.map((shape) => (
                  <li key={shape}>
                    <ShapeIcon shape={shape} width={30} height={18} />
                    {t(`shapes.${shape}`)}
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="button"
              onClick={() => {
                onPick(selected)
                close()
              }}
            >
              {t('templates.useSample')}
            </button>
          </div>
        </div>

        <h3 className="template-section-title">{t('templates.ownContent')}</h3>
        <ol className="template-steps">
          <li>{t('templates.step1')}</li>
          <li>{t('templates.step2')}</li>
          <li>{t('templates.step3')}</li>
        </ol>
        <div className="template-copy-row">
          <button
            type="button"
            className="button"
            onClick={() => void copy('prompt', t('templates.prompt', { outline }))}
            aria-live="polite"
          >
            {copied === 'prompt' ? t('paste.copied') : t('templates.copyPrompt')}
          </button>
          <button type="button" className="button" onClick={() => void copy('outline', outline)} aria-live="polite">
            {copied === 'outline' ? t('templates.copiedOutline') : t('templates.copyOutline')}
          </button>
        </div>
        <label className="field">
          <span className="visually-hidden">{t('paste.label')}</span>
          <textarea
            className="paste-input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t('templates.pastePlaceholder')}
            rows={6}
            spellCheck={false}
          />
        </label>
      </Dialog>
    )
  }

  return (
    <Dialog
      open={open}
      title={t('templates.title')}
      onClose={close}
      wide
      actions={
        <button type="button" className="button" onClick={close}>
          {t('dialogs.cancel')}
        </button>
      }
    >
      <p className="dialog-hint template-intro">{t('templates.intro')}</p>
      <div className="template-grid">
        {TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            className="template-card"
            onClick={() => (template.id === 'blank' ? (onPick(template), close()) : setSelected(template))}
            data-testid={`template-${template.id}`}
          >
            <TemplatePreview template={template} prefersDark={prefersDark} />
            <span className="template-name">{name(template)}</span>
            <span className="template-description">{t(`templates.${template.id}.description`)}</span>
          </button>
        ))}
      </div>
    </Dialog>
  )
}
