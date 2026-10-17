import { Download } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Menu } from '../components/Menu'
import { downloadBlob, downloadText } from '../features/file-manager/downloadAdapter'
import { autoTitle, buildChart, type BuildContext } from '../features/chart/buildOption'
import { chartImageBlob, copyChartImage, exportFileName, tableToCsv, type ImageFormat } from '../features/chart/exportChart'
import type { Recommendation } from '../features/chart/recommend'
import type { ChartStyle } from '../features/chart/style'
import type { Table } from '../features/chart/table'
import { THEME_NAME } from '../features/chart/theme'
import { useChartContext } from './useChartContext'

type EChartsModule = typeof import('../features/chart/echarts')

let runtime: Promise<EChartsModule> | null = null
/** ECharts is fetched once, the first time a chart is drawn. */
function loadECharts(): Promise<EChartsModule> {
  runtime ??= import('../features/chart/echarts')
  return runtime
}

interface ChartCardProps {
  rank: number
  rec: Recommendation
  table: Table
  style: ChartStyle
  selected: boolean
  onSelect: () => void
  onNotice: (message: string) => void
}

export function ChartCard({ rank, rec, table, style, selected, onSelect, onNotice }: ChartCardProps) {
  const { t } = useTranslation()
  const { lang, colors, labels } = useChartContext()
  const box = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<EChartsModule['init']> | null>(null)
  // The latest props for drawing, so a style change redraws without re-creating the chart.
  const latest = useRef({ rec, table, style, lang, colors, labels, highlight: undefined as string | undefined })
  const lines = useRef<{ name: string; data: (number | null)[] }[]>([])
  const [ready, setReady] = useState(false)
  const [multiples, setMultiples] = useState(false)

  const context = (): BuildContext => {
    const { lang, colors, labels, style, highlight } = latest.current
    return { lang, colors, labels, style, highlight, width: box.current?.clientWidth || 600 }
  }

  const draw = () => {
    const chart = chartRef.current
    const el = box.current
    if (!chart || !el) return
    const { rec, table } = latest.current
    const built = buildChart(rec, table, context())
    const series = (Array.isArray(built.option.series) ? built.option.series : []) as { name?: string; data?: unknown; silent?: boolean; xAxisIndex?: number }[]
    lines.current = series
      .filter((s) => !s.silent && (s.xAxisIndex ?? 0) === 0)
      .map((s) => ({ name: String(s.name), data: (s.data as (number | null)[]) ?? [] }))
    el.style.height = `${built.height}px`
    chart.resize()
    chart.setOption(built.option, { notMerge: true })
    setMultiples(Boolean(built.multiples))
  }

  // Style and language changes redraw the chart in place.
  useEffect(() => {
    latest.current = { ...latest.current, style, lang, labels }
    draw()
    // draw reads the latest props from the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, lang, labels])

  // A new recommendation, table or colour scheme creates the chart afresh.
  useEffect(() => {
    const el = box.current
    if (!el) return
    latest.current = { ...latest.current, rec, table, colors, highlight: undefined }
    let disposed = false
    let observer: ResizeObserver | null = null
    void loadECharts().then(({ init }) => {
      if (disposed) return
      const chart = init(el, THEME_NAME[colors.mode], { renderer: 'svg' })
      chartRef.current = chart
      if (rec.type === 'line') {
        // Which of several unordered lines is in colour; clicking another line moves it.
        const pick = (name: string | undefined) => {
          if (!name || name === latest.current.highlight) return
          latest.current.highlight = name
          draw()
        }
        chart.on('click', (params) => {
          if (params.componentType === 'series') pick(params.seriesName)
        })
        // Thin gray lines are hard to hit: a click anywhere in the plot picks the line nearest to it.
        chart.getZr().on('click', (event) => {
          const point = [event.offsetX, event.offsetY]
          if (lines.current.length < 2 || !chart.containPixel({ gridIndex: 0 }, point)) return
          const [x, y] = chart.convertFromPixel({ gridIndex: 0 }, point) as number[]
          const index = Math.round(x)
          const nearest = lines.current
            .filter((line) => typeof line.data[index] === 'number')
            .sort((a, b) => Math.abs(a.data[index]! - y) - Math.abs(b.data[index]! - y))[0]
          pick(nearest?.name)
        })
      }
      draw()
      setReady(true)
      let width = el.clientWidth
      observer = new ResizeObserver(() => {
        // Label wrapping depends on the width, so rebuild when it changes.
        if (el.clientWidth !== width) {
          width = el.clientWidth
          draw()
        }
      })
      observer.observe(el)
    })
    return () => {
      disposed = true
      observer?.disconnect()
      chartRef.current?.dispose()
      chartRef.current = null
    }
    // Style and language changes only redraw (above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec, table, colors])

  const title = style.title.trim() || autoTitle(rec, labels, lang) || t(`chart.charts.${rec.type}`)
  const exportImage = async (format: ImageFormat, transparent: boolean) => {
    try {
      const blob = await chartImageBlob(rec, table, context(), format, transparent)
      downloadBlob(blob, exportFileName(title, format))
    } catch {
      onNotice(t('chart.export.failed'))
    }
  }

  return (
    <article
      className="chart-card"
      data-selected={selected || undefined}
      aria-labelledby={`chart-title-${rank}`}
      onPointerDown={onSelect}
      onFocus={onSelect}
    >
      <header className="chart-card-header">
        <span className="chart-rank">{t('chart.rank', { n: rank })}</span>
        <h2 id={`chart-title-${rank}`}>{t(`chart.charts.${rec.type}`)}</h2>
        <div className="chart-card-actions">
          <Menu
            label={t('chart.export.label')}
            icon={<Download size={16} aria-hidden="true" />}
            align="end"
            items={[
              { label: t('chart.export.png'), onSelect: () => void exportImage('png', false) },
              { label: t('chart.export.svg'), onSelect: () => void exportImage('svg', false) },
              { label: t('chart.export.pngTransparent'), hint: t('chart.export.transparentHint'), onSelect: () => void exportImage('png', true) },
              { label: t('chart.export.svgTransparent'), hint: t('chart.export.transparentHint'), onSelect: () => void exportImage('svg', true) },
              {
                label: t('chart.export.copy'),
                onSelect: () =>
                  void copyChartImage(rec, table, context()).then(
                    () => onNotice(t('chart.export.copied')),
                    () => onNotice(t('chart.export.copyFailed')),
                  ),
              },
              {
                label: t('chart.export.csv'),
                hint: t('chart.export.csvHint'),
                onSelect: () => downloadText(tableToCsv(table, labels), exportFileName(title, 'csv'), 'text/csv'),
              },
            ]}
          />
        </div>
        <p>
          {t(`chart.reasons.${rec.reason}`)}
          {multiples && ` · ${t('chart.multiples')}`}
        </p>
      </header>
      <div className="chart-frame">
        <div ref={box} className="chart-box" role="img" aria-label={title} />
        {!ready && <span className="chart-loading">{t('chart.loading')}</span>}
      </div>
    </article>
  )
}
