import { Bold, Italic, Strikethrough, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CLEAR_STYLE,
  FONT_SIZES,
  lookToStyle,
  mergeLook,
  readLook,
  type NodeLook,
} from '../features/appearance/nodeStyles'
import { CUSTOM_COLOR_VARS, THEME_PRESETS, customizeTheme, withPalette } from '../features/appearance/themes'
import type { Direction, MapTheme } from '../features/mindmap/types'
import { ColorField } from './ColorField'
import type { EditorApi, SelectedNode } from './MindMapCanvas'
import { Segmented } from './Segmented'

interface Props {
  editor: EditorApi | null
  selection: SelectedNode[]
  onClose: () => void
}

type Tab = 'node' | 'map'

function ThemeSwatch({ theme }: { theme: MapTheme }) {
  return (
    <span className="theme-swatch" style={{ background: theme.cssVar['--bgcolor'] }} aria-hidden="true">
      <span
        className="theme-swatch-root"
        style={{ background: theme.cssVar['--root-bgcolor'], color: theme.cssVar['--root-color'] }}
      />
      <span className="theme-swatch-dots">
        {theme.palette.slice(0, 4).map((color) => (
          <span key={color} style={{ background: color }} />
        ))}
      </span>
    </span>
  )
}

export function StylePanel({ editor, selection, onClose }: Props) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>(selection.length ? 'node' : 'map')
  const [hadSelection, setHadSelection] = useState(selection.length > 0)
  // Selecting topics brings their controls forward.
  if ((selection.length > 0) !== hadSelection) {
    setHadSelection(selection.length > 0)
    if (selection.length > 0) setTab('node')
  }
  // Bumped after map-level changes so values are re-read from the editor.
  const [, setRevision] = useState(0)
  const refresh = () => setRevision((r) => r + 1)

  return (
    <aside id="style-panel" className="style-panel" aria-label={t('style.title')}>
      <div className="panel-header">
        <div className="panel-tabs" role="tablist">
          {(['node', 'map'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
            >
              {t(value === 'node' ? 'style.tabNode' : 'style.tabMap')}
            </button>
          ))}
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label={t('style.close')} title={t('style.close')}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="panel-body" role="tabpanel">
        {editor && tab === 'node' && <NodeTab editor={editor} selection={selection} />}
        {editor && tab === 'map' && <MapTab editor={editor} onChanged={refresh} />}
      </div>
    </aside>
  )
}

function NodeTab({ editor, selection }: { editor: EditorApi; selection: SelectedNode[] }) {
  const { t } = useTranslation()
  if (!selection.length) return <p className="panel-hint">{t('style.noSelection')}</p>

  const look = readLook(selection[0].style)
  /** Merges a change into each selected topic's own look, so other properties stay as they were. */
  const patchFor = (changes: Partial<NodeLook>) => (node: SelectedNode) =>
    lookToStyle(mergeLook(readLook(node.style), changes), node.depth)
  const apply = (changes: Partial<NodeLook>) => editor.applyNodeStyle(patchFor(changes))
  const preview = (changes: Partial<NodeLook>) => editor.previewNodeStyle(patchFor(changes))
  const hasBranch = selection.some((node) => node.depth > 0)
  const lined = look.border === 'full' || look.border === 'underline'

  return (
    <>
      <p className="panel-hint">{t('style.selected', { count: selection.length })}</p>

      <section className="panel-section">
        <Segmented
          label={t('style.shape')}
          value={look.shape ?? 'default'}
          options={[
            { value: 'default', label: t('style.default') },
            { value: 'square', label: t('style.square') },
            { value: 'rounded', label: t('style.rounded') },
            { value: 'pill', label: t('style.pill') },
          ]}
          onChange={(shape) => apply({ shape: shape === 'default' ? undefined : shape })}
        />
      </section>

      <section className="panel-section">
        <Segmented
          label={t('style.border')}
          value={look.border}
          options={[
            { value: 'default', label: t('style.default') },
            { value: 'none', label: t('style.none') },
            { value: 'full', label: t('style.full') },
            { value: 'underline', label: t('style.underline') },
          ]}
          onChange={(border) => apply({ border })}
        />
        {lined && (
          <>
            <Segmented
              label={t('style.borderWidth')}
              value={look.borderWidth}
              options={[
                { value: 1, label: t('style.thin') },
                { value: 2, label: t('style.medium') },
                { value: 3, label: t('style.thick') },
              ]}
              onChange={(borderWidth) => apply({ borderWidth })}
            />
            <Segmented
              label={t('style.borderStyle')}
              value={look.borderStyle}
              options={[
                { value: 'solid', label: t('style.solid') },
                { value: 'dashed', label: t('style.dashed') },
                { value: 'dotted', label: t('style.dotted') },
              ]}
              onChange={(borderStyle) => apply({ borderStyle })}
            />
            <ColorField
              label={t('style.borderColor')}
              value={look.borderColor}
              fallback={look.borderColor}
              onPreview={(borderColor) => preview({ borderColor })}
              onCommit={(borderColor) => borderColor && apply({ borderColor })}
            />
          </>
        )}
      </section>

      <section className="panel-section">
        <Segmented
          label={t('style.fill')}
          value={look.fill}
          options={[
            { value: 'default', label: t('style.default') },
            { value: 'none', label: t('style.none') },
            { value: 'solid', label: t('style.fillSolid') },
          ]}
          onChange={(fill) => apply({ fill })}
        />
        {look.fill === 'solid' && (
          <ColorField
            label={t('style.fillColor')}
            value={look.fillColor}
            fallback={look.fillColor}
            onPreview={(fillColor) => preview({ fillColor })}
            onCommit={(fillColor) => fillColor && apply({ fillColor })}
          />
        )}
      </section>

      <section className="panel-section">
        <span className="field-label">{t('style.text')}</span>
        <div className="text-controls">
          <label className="select-field">
            <span className="visually-hidden">{t('style.fontSize')}</span>
            <select
              value={look.fontSize ?? ''}
              onChange={(event) => apply({ fontSize: event.target.value || undefined })}
              title={t('style.fontSize')}
            >
              <option value="">
                {t('style.fontSize')} · {t('style.default')}
              </option>
              {FONT_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}px
                </option>
              ))}
            </select>
          </label>
          {(
            [
              ['bold', Bold],
              ['italic', Italic],
              ['strike', Strikethrough],
            ] as const
          ).map(([key, Icon]) => (
            <button
              key={key}
              type="button"
              className="toggle-button"
              aria-pressed={look[key]}
              aria-label={t(`style.${key}`)}
              title={t(`style.${key}`)}
              onClick={() => apply({ [key]: !look[key] })}
            >
              <Icon size={15} aria-hidden="true" />
            </button>
          ))}
        </div>
        <ColorField
          label={t('style.textColor')}
          value={look.textColor}
          fallback="#333333"
          clearLabel={t('style.useDefault')}
          onPreview={(textColor) => preview({ textColor })}
          onCommit={(textColor) => apply({ textColor })}
        />
      </section>

      {hasBranch && (
        <section className="panel-section">
          <ColorField
            label={t('style.branchColor')}
            value={selection[0].branchColor}
            fallback="#888888"
            clearLabel={t('style.auto')}
            onCommit={(color) => editor.setBranchColor(color)}
          />
        </section>
      )}

      <button type="button" className="button panel-reset" onClick={() => {
        editor.applyNodeStyle(() => CLEAR_STYLE)
        if (hasBranch) editor.setBranchColor(undefined)
      }}>
        {t('style.resetNode')}
      </button>
    </>
  )
}

function MapTab({ editor, onChanged }: { editor: EditorApi; onChanged: () => void }) {
  const { t } = useTranslation()
  const saved = editor.getTheme()
  const effective = editor.effectiveTheme()
  const selectedName = saved?.name ?? 'auto'
  const setTheme = (theme: MapTheme | undefined) => {
    editor.setTheme(theme)
    onChanged()
  }
  const palettes = THEME_PRESETS.filter((preset, index, all) => {
    // One chip per distinct palette.
    const key = preset.theme.palette.join()
    return all.findIndex((p) => p.theme.palette.join() === key) === index
  })

  return (
    <>
      <section className="panel-section">
        <span className="field-label">{t('style.theme')}</span>
        <div className="theme-grid">
          <button
            type="button"
            className="theme-card"
            aria-pressed={selectedName === 'auto'}
            onClick={() => setTheme(undefined)}
          >
            <span className="theme-swatch theme-swatch-auto" aria-hidden="true" />
            <span>{t('style.themeAuto')}</span>
          </button>
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="theme-card"
              aria-pressed={selectedName === preset.id}
              onClick={() => setTheme(structuredClone(preset.theme))}
            >
              <ThemeSwatch theme={preset.theme} />
              <span>{t(`themes.${preset.id}`)}</span>
            </button>
          ))}
          {selectedName === 'custom' && (
            <button type="button" className="theme-card" aria-pressed="true">
              <ThemeSwatch theme={effective} />
              <span>{t('themes.custom')}</span>
            </button>
          )}
        </div>
      </section>

      <section className="panel-section">
        <span className="field-label">{t('style.customColors')}</span>
        {CUSTOM_COLOR_VARS.map(({ key, cssVar }) => {
          const current = effective.cssVar[cssVar]
          return (
            <ColorField
              key={key}
              label={t(`style.colors.${key}`)}
              value={current}
              fallback="#888888"
              onPreview={(color) => editor.previewThemeVar(cssVar, color)}
              onCommit={(color) => color && setTheme(customizeTheme(effective, cssVar, color))}
            />
          )
        })}
      </section>

      <section className="panel-section">
        <span className="field-label">{t('style.palette')}</span>
        <div className="palette-grid">
          {palettes.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="palette-chip"
              aria-pressed={preset.theme.palette.join() === effective.palette.join()}
              aria-label={`${t('style.palette')}: ${t(`themes.${preset.id}`)}`}
              title={t(`themes.${preset.id}`)}
              onClick={() => setTheme(withPalette(effective, preset.theme.palette))}
            >
              {preset.theme.palette.slice(0, 6).map((color) => (
                <span key={color} style={{ background: color }} />
              ))}
            </button>
          ))}
        </div>
      </section>

      <section className="panel-section">
        <Segmented<Direction>
          label={t('style.layout')}
          value={editor.getDirection()}
          options={[
            { value: 0, label: t('style.layoutLeft') },
            { value: 1, label: t('style.layoutRight') },
            { value: 2, label: t('style.layoutSide') },
            { value: 3, label: t('style.layoutDown') },
          ]}
          onChange={(direction) => {
            editor.setDirection(direction)
            onChanged()
          }}
        />
        <label className="check-field">
          <input
            type="checkbox"
            checked={editor.isCompact()}
            onChange={(event) => {
              editor.setCompact(event.target.checked)
              onChanged()
            }}
          />
          {t('style.compact')}
        </label>
      </section>
    </>
  )
}
