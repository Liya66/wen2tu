import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buildChart, type ChartLabels } from '../features/chart/buildOption'
import type { ChartLanguage } from '../features/chart/format'
import type { Recommendation } from '../features/chart/recommend'
import type { Table } from '../features/chart/table'
import { DARK, LIGHT, THEME_NAME } from '../features/chart/theme'

type EChartsModule = typeof import('../features/chart/echarts')

let runtime: Promise<EChartsModule> | null = null
/** ECharts is fetched once, the first time a chart is drawn. */
function loadECharts(): Promise<EChartsModule> {
  runtime ??= import('../features/chart/echarts')
  return runtime
}

const DARK_QUERY = '(prefers-color-scheme: dark)'

function useDarkMode(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia(DARK_QUERY).matches)
  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY)
    const onChange = () => setDark(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return dark
}

interface ChartCardProps {
  rank: number
  rec: Recommendation
  table: Table
}

export function ChartCard({ rank, rec, table }: ChartCardProps) {
  const { t, i18n } = useTranslation()
  const box = useRef<HTMLDivElement>(null)
  const dark = useDarkMode()
  const [ready, setReady] = useState(false)
  const [multiples, setMultiples] = useState(false)
  const lang: ChartLanguage = i18n.resolvedLanguage === 'en' ? 'en' : 'zh-CN'

  useEffect(() => {
    const el = box.current
    if (!el) return
    let disposed = false
    let chart: ReturnType<EChartsModule['init']> | null = null
    let observer: ResizeObserver | null = null
    const labels: ChartLabels = { other: t('chart.other'), value: t('chart.value'), period: t('chart.period') }
    // Which of several unordered lines is in colour; clicking another line moves it.
    let highlight: string | undefined
    let lines: { name: string; data: (number | null)[] }[] = []
    const draw = () => {
      if (!chart) return
      const built = buildChart(rec, table, { lang, colors: dark ? DARK : LIGHT, labels, width: el.clientWidth || 600, highlight })
      const series = (Array.isArray(built.option.series) ? built.option.series : []) as { name?: string; data?: unknown; silent?: boolean; xAxisIndex?: number }[]
      lines = series
        .filter((s) => !s.silent && (s.xAxisIndex ?? 0) === 0)
        .map((s) => ({ name: String(s.name), data: (s.data as (number | null)[]) ?? [] }))
      el.style.height = `${built.height}px`
      setMultiples(Boolean(built.multiples))
      chart.resize()
      chart.setOption(built.option, { notMerge: true })
    }
    void loadECharts().then(({ init }) => {
      if (disposed) return
      chart = init(el, dark ? THEME_NAME.dark : THEME_NAME.light, { renderer: 'svg' })
      if (rec.type === 'line') {
        const pick = (name: string | undefined) => {
          if (!name || name === highlight) return
          highlight = name
          draw()
        }
        chart.on('click', (params) => {
          if (params.componentType === 'series') pick(params.seriesName)
        })
        // Thin gray lines are hard to hit: a click anywhere in the plot picks the line nearest to it.
        chart.getZr().on('click', (event) => {
          const point = [event.offsetX, event.offsetY]
          if (!chart || lines.length < 2 || !chart.containPixel({ gridIndex: 0 }, point)) return
          const [x, y] = chart.convertFromPixel({ gridIndex: 0 }, point) as number[]
          const index = Math.round(x)
          const nearest = lines
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
      chart?.dispose()
    }
  }, [rec, table, dark, lang, t])

  return (
    <article className="chart-card" aria-labelledby={`chart-title-${rank}`}>
      <header className="chart-card-header">
        <span className="chart-rank">{t('chart.rank', { n: rank })}</span>
        <h2 id={`chart-title-${rank}`}>{t(`chart.charts.${rec.type}`)}</h2>
        <p>
          {t(`chart.reasons.${rec.reason}`)}
          {multiples && ` · ${t('chart.multiples')}`}
        </p>
      </header>
      <div className="chart-frame">
        <div ref={box} className="chart-box" role="img" aria-label={t(`chart.charts.${rec.type}`)} />
        {!ready && <span className="chart-loading">{t('chart.loading')}</span>}
      </div>
    </article>
  )
}
