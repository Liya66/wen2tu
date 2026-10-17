import { RotateCcw, TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Segmented } from '../components/Segmented'
import { autoTitle, buildChart, type Swatch } from '../features/chart/buildOption'
import { checkColors, fixColor, paletteFromHue, type ColorIssue } from '../features/chart/colorMath'
import type { Recommendation } from '../features/chart/recommend'
import {
  DEFAULT_STYLE,
  PALETTES,
  styledColors,
  type ChartStyle,
  type LabelMode,
  type LegendMode,
  type NumberMode,
  type Orientation,
  type SortMode,
} from '../features/chart/style'
import type { Table } from '../features/chart/table'
import { useChartContext } from './useChartContext'

interface Props {
  rank: number
  rec: Recommendation
  table: Table
  style: ChartStyle
  onChange: (style: ChartStyle) => void
  onClose: () => void
}

type Tab = 'chart' | 'colors'

export function ChartStylePanel({ rank, rec, table, style, onChange, onClose }: Props) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('chart')
  const set = (changes: Partial<ChartStyle>) => onChange({ ...style, ...changes })

  return (
    <aside id="style-panel" className="style-panel chart-style-panel" aria-label={t('chart.style.title')}>
      <div className="panel-header">
        <div className="panel-tabs" role="tablist">
          {(['chart', 'colors'] as const).map((value) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>
              {t(`chart.style.tab.${value}`)}
            </button>
          ))}
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label={t('style.close')} title={t('style.close')}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <p className="panel-hint chart-style-target">
        {t('chart.rank', { n: rank })} · {t(`chart.charts.${rec.type}`)}
      </p>
      <div className="panel-body" role="tabpanel">
        {tab === 'chart' ? (
          <ChartTab rec={rec} style={style} set={set} />
        ) : (
          <ColorsTab rec={rec} table={table} style={style} set={set} />
        )}
      </div>
    </aside>
  )
}

function ChartTab({ rec, style, set }: { rec: Recommendation; style: ChartStyle; set: (changes: Partial<ChartStyle>) => void }) {
  const { t } = useTranslation()
  const { lang, labels, colors } = useChartContext()
  const bars = rec.type.startsWith('bar')
  const several = Boolean(rec.series) || rec.measures.length > 1 || rec.type === 'donut'
  // Sorting applies to a category axis whose values have no natural order of their own.
  const sortable = rec.x?.type === 'category' && !rec.x.orderKey && rec.type !== 'timeline'

  return (
    <>
      <section className="panel-section">
        <label className="field">
          <span className="field-label">{t('chart.style.chartTitle')}</span>
          <input
            type="text"
            value={style.title}
            placeholder={autoTitle(rec, labels, lang)}
            onChange={(event) => set({ title: event.target.value })}
          />
        </label>
        {!style.title && (
          <button type="button" className="button chart-use-title" onClick={() => set({ title: autoTitle(rec, labels, lang) })}>
            {t('chart.style.useSuggestedTitle')}
          </button>
        )}
      </section>

      <section className="panel-section">
        <span className="field-label">{t('chart.style.palette')}</span>
        <div className="palette-grid chart-palette-grid">
          {PALETTES.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="palette-chip"
              aria-pressed={style.palette === preset.id}
              title={t(`chart.style.palettes.${preset.id}`)}
              aria-label={`${t('chart.style.palette')}: ${t(`chart.style.palettes.${preset.id}`)}`}
              onClick={() => set({ palette: preset.id })}
            >
              {paletteFromHue(preset.hue, preset.chroma, colors.mode).ramp.map((color) => (
                <span key={color} style={{ background: color }} />
              ))}
            </button>
          ))}
          <label className="palette-chip chart-palette-custom" data-pressed={style.palette === 'custom'} title={t('chart.style.customPalette')}>
            {(style.palette === 'custom' ? styledColors(colors, style).ramp : []).map((color) => (
              <span key={color} style={{ background: color }} />
            ))}
            {style.palette !== 'custom' && <span className="chart-palette-custom-label">{t('chart.style.customPalette')}</span>}
            <input
              type="color"
              value={style.baseColor ?? '#4a6d91'}
              aria-label={t('chart.style.customPalette')}
              onChange={(event) => set({ palette: 'custom', baseColor: event.target.value })}
            />
          </label>
        </div>
        <p className="panel-hint">{t('chart.style.paletteHint')}</p>
      </section>

      <section className="panel-section">
        <Segmented<LabelMode>
          label={t('chart.style.labels')}
          value={style.labels}
          options={[
            { value: 'auto', label: t('chart.style.auto') },
            { value: 'all', label: t('chart.style.labelsAll') },
            { value: 'none', label: t('chart.style.hidden') },
          ]}
          onChange={(labels) => set({ labels })}
        />
        {several && (
          <Segmented<LegendMode>
            label={t('chart.style.legend')}
            value={style.legend}
            options={[
              { value: 'auto', label: t('chart.style.auto') },
              { value: 'top', label: t('chart.style.top') },
              { value: 'bottom', label: t('chart.style.bottom') },
              { value: 'none', label: t('chart.style.hidden') },
            ]}
            onChange={(legend) => set({ legend })}
          />
        )}
        {bars && (
          <Segmented<Orientation>
            label={t('chart.style.orientation')}
            value={style.orientation}
            options={[
              { value: 'auto', label: t('chart.style.auto') },
              { value: 'vertical', label: t('chart.style.vertical') },
              { value: 'horizontal', label: t('chart.style.horizontal') },
            ]}
            onChange={(orientation) => set({ orientation })}
          />
        )}
        {sortable && (
          <Segmented<SortMode>
            label={t('chart.style.sort')}
            value={style.sort}
            options={[
              { value: 'auto', label: t('chart.style.sortValue') },
              { value: 'original', label: t('chart.style.sortOriginal') },
            ]}
            onChange={(sort) => set({ sort })}
          />
        )}
        <Segmented<NumberMode>
          label={t('chart.style.numbers')}
          value={style.numbers}
          options={[
            { value: 'compact', label: t(lang === 'zh-CN' ? 'chart.style.numbersCompactZh' : 'chart.style.numbersCompactEn') },
            { value: 'full', label: t('chart.style.numbersFull') },
          ]}
          onChange={(numbers) => set({ numbers })}
        />
        {rec.type !== 'donut' && (
          <label className="check-field">
            <input type="checkbox" checked={style.grid} onChange={(event) => set({ grid: event.target.checked })} />
            {t('chart.style.grid')}
          </label>
        )}
      </section>

      <section className="panel-section">
        <button
          type="button"
          className="button chart-reset"
          onClick={() => set({ ...DEFAULT_STYLE, colors: style.colors })}
        >
          <RotateCcw size={14} aria-hidden="true" /> {t('chart.style.resetChart')}
        </button>
      </section>
    </>
  )
}

function issueText(issue: ColorIssue, t: (key: string, options?: Record<string, unknown>) => string): string {
  return issue.kind === 'faint' ? t('chart.style.issue.faint') : t(`chart.style.issue.${issue.kind}`, { other: issue.other })
}

function ColorsTab({ rec, table, style, set }: { rec: Recommendation; table: Table; style: ChartStyle; set: (changes: Partial<ChartStyle>) => void }) {
  const { t } = useTranslation()
  const { lang, labels, colors } = useChartContext()
  const built = buildChart(rec, table, { lang, colors, labels, style, width: 600 })
  const swatches = built.swatches ?? []
  const distinguish = Boolean(built.distinguish)
  const themed = styledColors(colors, style)
  const surface = colors.surface
  const issues = checkColors(
    swatches.map((s) => ({ ...s, label: s.key })),
    surface,
    distinguish,
  )
  const quick = [...themed.ramp, colors.context]

  const setColor = (key: string, color: string | undefined) => {
    const next = { ...style.colors }
    if (color) next[key] = color
    else delete next[key]
    set({ colors: next })
  }
  const fixed = (swatch: Swatch): string | undefined => {
    const others = swatches.filter((s) => s.key !== swatch.key).map((s) => s.color)
    // No lightness of this hue works: fall back to the default colour.
    return fixColor(swatch.color, others, surface, distinguish) ?? undefined
  }
  const fixAll = () => {
    const next = { ...style.colors }
    for (const issue of issues) {
      const swatch = swatches.find((s) => s.key === issue.key)
      if (!swatch) continue
      const others = swatches.filter((s) => s.key !== swatch.key).map((s) => next[s.key] ?? s.color)
      const color = fixColor(swatch.color, others, surface, distinguish)
      if (color) next[swatch.key] = color
      else delete next[swatch.key]
    }
    set({ colors: next })
  }

  if (!swatches.length) return <p className="panel-hint">{t('chart.style.noColors')}</p>

  return (
    <>
      <p className="panel-hint">{t(distinguish ? 'chart.style.colorsHintSeries' : 'chart.style.colorsHintItems')}</p>
      {issues.length > 0 && (
        <div className="chart-issues" role="status">
          <TriangleAlert size={14} aria-hidden="true" />
          <span>{t('chart.style.issueCount', { count: issues.length })}</span>
          <button type="button" className="button" onClick={fixAll}>
            {t('chart.style.fixAll')}
          </button>
        </div>
      )}
      <ul className="chart-swatches">
        {swatches.map((swatch) => {
          const issue = issues.find((i) => i.key === swatch.key)
          return (
            <li key={swatch.key} data-issue={issue?.kind}>
              <div className="chart-swatch-head">
                <span className="chart-swatch-name" title={swatch.key}>
                  {swatch.key}
                </span>
                {swatch.custom && (
                  <button type="button" className="icon-button" onClick={() => setColor(swatch.key, undefined)} title={t('chart.style.resetColor')} aria-label={`${t('chart.style.resetColor')}: ${swatch.key}`}>
                    <RotateCcw size={13} aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="color-row" role="group" aria-label={swatch.key}>
                {quick.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="swatch"
                    style={{ background: color }}
                    aria-pressed={swatch.color.toLowerCase() === color.toLowerCase()}
                    aria-label={color}
                    title={color}
                    onClick={() => setColor(swatch.key, color)}
                  />
                ))}
                <label className="swatch swatch-picker" title={t('chart.style.pickColor')} style={{ background: quick.includes(swatch.color) ? undefined : swatch.color }}>
                  <input
                    type="color"
                    value={swatch.color}
                    aria-label={`${t('chart.style.pickColor')}: ${swatch.key}`}
                    onChange={(event) => setColor(swatch.key, event.target.value)}
                  />
                </label>
              </div>
              {issue && (
                <p className="chart-issue">
                  <span>{issueText(issue, t)}</span>
                  <button type="button" className="button" onClick={() => setColor(swatch.key, fixed(swatch))}>
                    {t('chart.style.fix')}
                  </button>
                </p>
              )}
            </li>
          )
        })}
      </ul>
      {Object.keys(style.colors).length > 0 && (
        <button type="button" className="button chart-reset" onClick={() => set({ colors: {} })}>
          <RotateCcw size={14} aria-hidden="true" /> {t('chart.style.resetColors')}
        </button>
      )}
    </>
  )
}
