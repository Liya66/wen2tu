/**
 * Turns a recommendation into an ECharts option. Pure: no ECharts runtime
 * here, so it can be tested and the library stays in its own chunk.
 *
 * House rules: bars start at zero; categories without a natural order are
 * sorted by value; missing values stay gaps; one value axis per panel (two
 * units become two stacked panels, never a second axis); long labels wrap
 * or turn the bars sideways; one hue (see "colour plans" below).
 */
import type { BarSeriesOption, CustomSeriesOption, HeatmapSeriesOption, LineSeriesOption, PieSeriesOption, ScatterSeriesOption } from 'echarts/charts'
import type { GridComponentOption, LegendComponentOption, TooltipComponentOption, VisualMapComponentOption } from 'echarts/components'
import type { CustomSeriesRenderItemAPI, CustomSeriesRenderItemParams } from 'echarts'
import type { ComposeOption } from 'echarts/core'
import { fillPeriods, formatDate, formatTick, formatValue, type ChartLanguage } from './format'
import { comparable, type Recommendation } from './recommend'
import type { Column, Table, Unit } from './table'
import { chartColumns } from './table'
import type { ChartColors } from './theme'

export type ChartOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | ScatterSeriesOption
  | HeatmapSeriesOption
  | PieSeriesOption
  | CustomSeriesOption
  | GridComponentOption
  | LegendComponentOption
  | TooltipComponentOption
  | VisualMapComponentOption
>

export interface ChartLabels {
  other: string
  value: string
  period: string
}

export interface BuildContext {
  lang: ChartLanguage
  colors: ChartColors
  labels: ChartLabels
  /** Width of the chart box in px, for wrapping axis labels. */
  width: number
  /** Name of the line to highlight among unordered lines (the largest when unset). */
  highlight?: string
}

export interface BuiltChart {
  option: ChartOption
  height: number
  /** Drawn as small multiples: one panel per group, on one scale. */
  multiples?: boolean
}

const NO_UNIT: Unit = { prefix: '', suffix: '', percent: false }

// ---- labels ----

export function columnLabel(col: Column | undefined, labels: ChartLabels): string {
  if (!col) return ''
  if (col.name === '__period') return labels.period
  if (col.name === '__value') return labels.value
  return col.label
}

/** "GDP（元）" / "Revenue ($)": the axis name says the unit the ticks leave out. */
function axisName(label: string, unit: Unit, lang: ChartLanguage): string {
  const unitText = unit.suffix || (unit.prefix && !unit.percent ? unit.prefix : '')
  if (!unitText) return label
  return lang === 'zh-CN' ? `${label}（${unitText}）` : `${label} (${unitText})`
}

function keyOf(col: Column, row: number): string | null {
  if (col.type === 'date' || col.type === 'number') return col.values[row] === null ? null : String(col.values[row])
  return col.text[row] ? col.text[row] : null
}

function keyLabel(col: Column, key: string, lang: ChartLanguage): string {
  if (col.type === 'date') return formatDate(Number(key), col.grain, lang, col.yearless)
  return key
}

// ---- pivot: rows → x keys × series ----

interface Pivot {
  xKeys: string[]
  xLabels: string[]
  series: { name: string; unit: Unit; measure: Column; values: (number | null)[] }[]
}

function averages(measure: Column): boolean {
  return measure.unit.percent || measure.aggregate === 'avg' || measure.aggregate === 'min' || measure.aggregate === 'max'
}

function sortKeys(col: Column, keys: string[], totals: Map<string, number>, keepGiven: boolean): string[] {
  if (col.type === 'date' || col.type === 'number') {
    const times = keys.map(Number)
    return col.type === 'date' ? fillPeriods(times, col.grain).map(String) : [...times].sort((a, b) => a - b).map(String)
  }
  if (col.orderKey) {
    const rank = new Map<string, number>()
    col.text.forEach((text, i) => rank.set(text, Math.min(rank.get(text) ?? Infinity, col.orderKey![i])))
    return [...keys].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0))
  }
  if (keepGiven) return keys
  // No natural order: largest first.
  return [...keys].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0))
}

function pivot(rec: Recommendation, table: Table, ctx: BuildContext, maxSeries = MAX_PANELS): Pivot {
  const { rowCount } = chartColumns(table)
  const x = rec.x!
  const sortedByQuery = Boolean(table.sql?.orderBy.some((o) => rec.measures.some((m) => m.name.toLowerCase() === o.name)))
  const cells = new Map<string, Map<string, { sum: number; n: number }>>()
  const xTotals = new Map<string, number>()
  const sTotals = new Map<string, number>()
  const xSeen: string[] = []
  const sSeen: string[] = []
  const add = (xKey: string, sKey: string, value: number | null) => {
    if (!cells.has(sKey)) {
      cells.set(sKey, new Map())
      sSeen.push(sKey)
    }
    if (!xTotals.has(xKey)) {
      xTotals.set(xKey, 0)
      xSeen.push(xKey)
    }
    if (value === null) return
    const cell = cells.get(sKey)!.get(xKey) ?? { sum: 0, n: 0 }
    cell.sum += value
    cell.n++
    cells.get(sKey)!.set(xKey, cell)
    xTotals.set(xKey, xTotals.get(xKey)! + value)
    sTotals.set(sKey, (sTotals.get(sKey) ?? 0) + value)
  }
  for (let row = 0; row < rowCount; row++) {
    const xKey = keyOf(x, row)
    if (xKey === null) continue
    if (rec.series) {
      const sKey = keyOf(rec.series, row)
      if (sKey !== null) add(xKey, sKey, rec.measures[0].values[row])
    } else {
      for (const m of rec.measures) add(xKey, m.name, m.values[row])
    }
  }

  const xKeys = sortKeys(x, xSeen, xTotals, sortedByQuery)
  let sKeys = rec.series ? sortKeys(rec.series, sSeen, sTotals, false) : sSeen
  const measureOf = (sKey: string) => (rec.series ? rec.measures[0] : rec.measures.find((m) => m.name === sKey)!)
  const valueOf = (sKey: string, xKey: string): number | null => {
    const cell = cells.get(sKey)?.get(xKey)
    if (!cell) return null
    return averages(measureOf(sKey)) ? cell.sum / cell.n : cell.sum
  }
  let series = sKeys.map((sKey) => ({
    name: rec.series ? keyLabel(rec.series, sKey, ctx.lang) : columnLabel(measureOf(sKey), ctx.labels),
    unit: measureOf(sKey).unit,
    measure: measureOf(sKey),
    values: xKeys.map((xKey) => valueOf(sKey, xKey)),
  }))
  // Past the panel limit, the smallest groups fold into "Other".
  if (rec.series && series.length > maxSeries && !averages(rec.measures[0])) {
    const kept = series.slice(0, maxSeries - 1)
    const rest = series.slice(maxSeries - 1)
    const other = xKeys.map((_, i) => {
      const present = rest.map((s) => s.values[i]).filter((v): v is number => v !== null)
      return present.length ? present.reduce((a, b) => a + b, 0) : null
    })
    series = [...kept, { ...rest[0], name: ctx.labels.other, values: other }]
    sKeys = sKeys.slice(0, maxSeries)
  }
  return { xKeys, xLabels: xKeys.map((key) => keyLabel(x, key, ctx.lang)), series }
}

// ---- shared pieces ----

/** Rough rendered width of 12px text: CJK characters are about twice as wide as Latin ones. */
function textWidth(text: string): number {
  let n = 0
  for (const ch of text) n += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 12 : 6.6
  return n
}

function legend(names: string[], ctx: BuildContext): LegendComponentOption | undefined {
  // One series needs no legend: the card title names it.
  if (names.length < 2) return undefined
  return { type: 'scroll', top: 0, left: 0, data: names, textStyle: { color: ctx.colors.textMuted } }
}

function tooltipRow(color: string, name: string, value: string): string {
  const swatch = `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:6px"></span>`
  return `<div style="display:flex;justify-content:space-between;gap:16px"><span>${swatch}${escapeHtml(name)}</span><b style="font-weight:600">${escapeHtml(value)}</b></div>`
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

type AxisParam = { axisValueLabel?: string; name?: string; seriesName?: string; value?: unknown; color?: unknown; dataIndex?: number; seriesIndex?: number }

/** `refs` maps each ECharts series index to its pivot series (-1: context only, left out). */
function axisTooltip(p: Pivot, ctx: BuildContext, refs: number[]): TooltipComponentOption {
  return {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    formatter: (params: unknown) => {
      const list = ((Array.isArray(params) ? params : [params]) as AxisParam[]).filter((item) => (refs[item.seriesIndex ?? 0] ?? -1) >= 0)
      if (!list.length) return ''
      const index = list[0].dataIndex ?? 0
      const rows = list.map((item) => {
        const s = p.series[refs[item.seriesIndex ?? 0]]
        return tooltipRow(String(item.color), s.name, formatValue(s.values[index], s.unit, ctx.lang))
      })
      return `<div style="margin-bottom:4px;color:${ctx.colors.textMuted}">${escapeHtml(p.xLabels[index] ?? '')}</div>${rows.join('')}`
    },
  }
}

// ---- colour plans ----

/**
 * How a chart's series get their colour: one series → the accent; ordered
 * series (and stacks of up to 3 unordered parts) → steps of the ramp;
 * up to 3 unordered lines → the largest highlighted, the rest gray;
 * anything more → small multiples, one panel per series.
 */
type Plan = 'single' | 'ramp' | 'highlight' | 'multiples'

const MAX_RAMP = 5
const MAX_UNORDERED = 3
const MAX_PANELS = 6

function orderedSeries(rec: Recommendation): boolean {
  return Boolean(rec.series && (rec.series.type === 'date' || rec.series.orderKey))
}

function planFor(kind: 'bar' | 'line', count: number, ordered: boolean): Plan {
  if (count <= 1) return 'single'
  if (ordered) return count <= MAX_RAMP ? 'ramp' : 'multiples'
  if (count > MAX_UNORDERED) return 'multiples'
  return kind === 'line' ? 'highlight' : 'ramp'
}

/** `count` evenly spaced ramp steps, least to most prominent. */
function rampColors(count: number, ctx: BuildContext): string[] {
  const ramp = ctx.colors.ramp
  if (count <= 1) return [ctx.colors.accent]
  if (count === 2) return [ramp[1], ramp[3]]
  return Array.from({ length: count }, (_, i) => ramp[Math.round((i * (ramp.length - 1)) / (count - 1))])
}

/** Ordered series step up the ramp in order; unordered ones by size, the largest darkest. */
function seriesColors(p: Pivot, ordered: boolean, ctx: BuildContext): string[] {
  const colors = rampColors(p.series.length, ctx)
  if (ordered) return colors
  const byTotal = p.series.map((_, i) => i).sort((a, b) => total(p.series[b]) - total(p.series[a]))
  const out: string[] = []
  byTotal.forEach((index, rank) => (out[index] = colors[colors.length - 1 - rank]))
  return out
}

function total(s: Pivot['series'][number]): number {
  return s.values.reduce<number>((acc, v) => acc + (v ?? 0), 0)
}

/** The series to highlight: the one asked for, else the largest. */
function highlightIndex(p: Pivot, indices: number[], ctx: BuildContext): number {
  const asked = indices.find((i) => p.series[i].name === ctx.highlight)
  if (asked !== undefined) return asked
  return indices.reduce((best, i) => (total(p.series[i]) > total(p.series[best]) ? i : best), indices[0])
}

/** Rounds a value range out to clean ticks, so panels can share one scale. */
function niceRange(min: number, max: number, fromZero: boolean): [number, number] {
  const lo = fromZero ? Math.min(0, min) : min
  const span = max - lo || Math.abs(max) || 1
  const raw = span / 4
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((m) => m >= raw)!
  return [fromZero && min >= 0 ? 0 : Math.floor(lo / step) * step, Math.ceil(max / step) * step]
}

interface Panel {
  left: number
  top: number
  width: number
  height: number
}

/** Panels in a grid: as many columns as fit (≥ 300px each), filled row by row. */
function layoutPanels(count: number, ctx: BuildContext, top: number, height: number, minWidth = 300): { panels: Panel[]; bottom: number } {
  const cols = Math.max(1, Math.min(count, Math.floor(ctx.width / minWidth)))
  const width = ctx.width / cols
  const gapY = 36
  const panels = Array.from({ length: count }, (_, i) => ({
    left: (i % cols) * width + 4,
    top: top + Math.floor(i / cols) * (height + gapY),
    width: width - 16,
    height,
  }))
  return { panels, bottom: top + Math.ceil(count / cols) * (height + gapY) - gapY }
}

// ---- bars ----

function barChart(rec: Recommendation, table: Table, ctx: BuildContext): BuiltChart {
  const ordered = orderedSeries(rec)
  const probe = pivot(rec, table, ctx, Infinity)
  const plan = planFor('bar', probe.series.length, ordered)
  const p = plan === 'multiples' && !ordered ? pivot(rec, table, ctx, MAX_PANELS) : probe
  if (plan === 'multiples') return barMultiples(p, Boolean(rec.horizontal), ctx)

  const stacked = rec.type === 'bar-stacked'
  const horizontal = Boolean(rec.horizontal)
  const unit = p.series[0]?.unit ?? NO_UNIT
  const hasLegend = p.series.length >= 2
  const n = p.xKeys.length
  const colors = seriesColors(p, ordered, ctx)
  const series: BarSeriesOption[] = p.series.map((s, i) => ({
    type: 'bar',
    name: s.name,
    data: s.values,
    stack: stacked ? 'total' : undefined,
    barMaxWidth: 24,
    barGap: '15%',
    color: colors[i],
    // A rounded data end, square at the baseline. Stacked segments are split by a surface-coloured gap instead.
    itemStyle: stacked
      ? { borderColor: ctx.colors.surface, borderWidth: 1, borderRadius: i === p.series.length - 1 ? dataEnd(horizontal) : 0 }
      : { borderRadius: dataEnd(horizontal) },
    emphasis: { focus: 'series' },
  }))
  // A single series gets a value at each bar end when there is room.
  if (series.length === 1 && n <= 16) series[0].label = barValueLabel(horizontal, unit, ctx)
  const values = p.series.flatMap((s) => s.values).filter((v): v is number => v !== null)
  const valueAxis = barValueAxis(values, horizontal, axisName(rec.series || rec.measures.length === 1 ? columnLabel(rec.measures[0], ctx.labels) : '', unit, ctx.lang), unit, ctx)
  const { axis: categoryAxis, lines } = barCategoryAxis(p.xLabels, horizontal, ctx.width)
  const rowHeight = Math.max(30, 18 * p.series.length, lines * 15 + 10)
  const height = horizontal ? Math.max(240, n * rowHeight + (hasLegend ? 100 : 70)) : 340 + (lines - 1) * 15
  return {
    height,
    option: {
      grid: { left: 8, right: horizontal ? 48 : 16, top: hasLegend ? 64 : 44, bottom: horizontal ? 32 : 8, containLabel: true },
      legend: legend(p.series.map((s) => s.name), ctx),
      tooltip: axisTooltip(p, ctx, p.series.map((_, i) => i)),
      xAxis: horizontal ? valueAxis : categoryAxis,
      yAxis: horizontal ? categoryAxis : valueAxis,
      series,
    },
  }
}

function dataEnd(horizontal: boolean): number[] {
  return horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]
}

function barValueLabel(horizontal: boolean, unit: Unit, ctx: BuildContext): BarSeriesOption['label'] {
  return {
    show: true,
    position: horizontal ? 'right' : 'top',
    color: ctx.colors.textMuted,
    fontSize: 11,
    formatter: (item: { value?: unknown }) => (typeof item.value === 'number' ? formatTick(item.value, unit, ctx.lang) : ''),
  }
}

function barValueAxis(values: number[], horizontal: boolean, name: string, unit: Unit, ctx: BuildContext, shared?: [number, number]) {
  return {
    type: 'value' as const,
    // Bars start at zero.
    min: shared ? shared[0] : values.every((v) => v >= 0) ? 0 : undefined,
    max: shared ? shared[1] : values.every((v) => v <= 0) ? 0 : undefined,
    scale: false,
    name,
    nameLocation: horizontal ? ('middle' as const) : ('end' as const),
    nameGap: horizontal ? 28 : 22,
    nameTextStyle: horizontal ? {} : { align: 'left' as const, padding: [0, 0, 0, -8] },
    axisLabel: { formatter: (v: number) => formatTick(v, unit, ctx.lang) },
  }
}

/** Long labels wrap; the caller gives each bar row room for its wrapped lines. */
function barCategoryAxis(labels: string[], horizontal: boolean, width: number) {
  const labelWidth = horizontal ? Math.min(200, Math.max(72, width * 0.3)) : Math.max(36, (width - 80) / Math.max(labels.length, 1) - 6)
  const lines = Math.max(1, ...labels.map((label) => Math.ceil(textWidth(label) / labelWidth)))
  return {
    lines,
    axis: {
      type: 'category' as const,
      data: labels,
      inverse: horizontal,
      axisLabel: { interval: 0, width: labelWidth, overflow: 'break' as const, lineHeight: 15, hideOverlap: false },
    },
  }
}

/** One small bar chart per series, all on the same value scale. */
function barMultiples(p: Pivot, horizontal: boolean, ctx: BuildContext): BuiltChart {
  const unit = p.series[0]?.unit ?? NO_UNIT
  const values = p.series.flatMap((s) => s.values).filter((v): v is number => v !== null)
  const shared = niceRange(Math.min(0, ...values), Math.max(0, ...values), true)
  const panelHeight = horizontal ? Math.max(160, p.xKeys.length * 24 + 40) : 180
  const { panels, bottom } = layoutPanels(p.series.length, ctx, 8, panelHeight, horizontal ? 260 : 300)
  const firstColumn = (k: number) => panels[k].left === panels[0].left
  const grids: GridComponentOption[] = panels.map((panel) => ({ ...panel, top: panel.top + 22, height: panel.height - 22, containLabel: true }))
  const categoryAxes = panels.map((panel, k) => {
    const { axis } = barCategoryAxis(p.xLabels, horizontal, panel.width)
    return { ...axis, gridIndex: k, axisLabel: { ...axis.axisLabel, show: !horizontal || firstColumn(k) } }
  })
  const valueAxes = panels.map((_, k) => ({ ...barValueAxis(values, horizontal, '', unit, ctx, shared), gridIndex: k, splitNumber: 3 }))
  // The panel's name sits above it, where a value axis name would go.
  const titled = horizontal ? categoryAxes : valueAxes
  titled.forEach((axis, k) => Object.assign(axis, { name: p.series[k].name, nameLocation: horizontal ? 'start' : 'end', nameGap: 8, nameTextStyle: { align: 'left', color: ctx.colors.text, fontWeight: 600, padding: [0, 0, 0, horizontal ? 0 : -8] } }))
  return {
    height: bottom + 16,
    multiples: true,
    option: {
      grid: grids,
      tooltip: axisTooltip(p, ctx, p.series.map((_, i) => i)),
      xAxis: horizontal ? valueAxes : categoryAxes,
      yAxis: horizontal ? categoryAxes : valueAxes,
      series: p.series.map((s, k) => ({
        type: 'bar',
        name: s.name,
        data: s.values,
        xAxisIndex: k,
        yAxisIndex: k,
        barMaxWidth: 18,
        color: ctx.colors.accent,
        itemStyle: { borderRadius: dataEnd(horizontal) },
      })),
    },
  }
}

// ---- lines (two units → two panels, never two axes) ----

function lineChart(rec: Recommendation, table: Table, ctx: BuildContext): BuiltChart {
  const ordered = orderedSeries(rec)
  const probe = pivot(rec, table, ctx, Infinity)
  // Series whose measures can share an axis.
  const groups: number[][] = []
  probe.series.forEach((s, i) => {
    const group = groups.find((g) => comparable(probe.series[g[0]].measure, s.measure))
    if (group) group.push(i)
    else groups.push([i])
  })
  if (groups.length === 1 && planFor('line', probe.series.length, ordered) === 'multiples') {
    return lineMultiples(ordered ? probe : pivot(rec, table, ctx, MAX_PANELS), ctx)
  }
  const p = probe
  const plan = groups.length > 1 ? 'highlight' : planFor('line', p.series.length, ordered)
  const ramp = plan === 'ramp' ? seriesColors(p, ordered, ctx) : []
  const highlighted = new Set(groups.map((g) => highlightIndex(p, g, ctx)))
  const labelled = plan === 'highlight' && groups.some((g) => g.length > 1)
  const endLabelWidth = labelled ? Math.min(140, Math.max(...p.series.map((s) => textWidth(s.name))) + 12) : 0

  const hasLegend = plan === 'ramp'
  const top = hasLegend ? 40 : 16
  const panelHeight = groups.length > 1 ? 170 : 290
  const gap = 44
  const showSymbols = p.xKeys.length <= 24
  const grids: GridComponentOption[] = groups.map((_, k) => ({
    left: 8,
    right: 24 + endLabelWidth,
    top: top + 22 + k * (panelHeight + gap),
    height: panelHeight - 22,
    containLabel: true,
  }))
  const xAxes = groups.map((_, k) => ({
    type: 'category' as const,
    gridIndex: k,
    data: p.xLabels,
    boundaryGap: false,
    axisLabel: { show: k === groups.length - 1, hideOverlap: true },
  }))
  const yAxes = groups.map((group, k) => {
    const unit = p.series[group[0]].unit
    const name = rec.series ? columnLabel(rec.measures[0], ctx.labels) : group.length === 1 ? p.series[group[0]].name : groups.length > 1 ? columnLabel(p.series[group[0]].measure, ctx.labels) : ''
    return {
      type: 'value' as const,
      gridIndex: k,
      scale: true,
      name: axisName(name, unit, ctx.lang),
      nameLocation: 'end' as const,
      nameTextStyle: { align: 'left' as const, padding: [0, 0, 0, -8] },
      axisLabel: { formatter: (v: number) => formatTick(v, unit, ctx.lang) },
    }
  })
  const series: LineSeriesOption[] = p.series.map((s, i) => {
    const k = groups.findIndex((group) => group.includes(i))
    const solo = groups[k].length === 1
    const isHighlight = plan !== 'highlight' || solo || highlighted.has(i)
    const color = plan === 'ramp' ? ramp[i] : isHighlight ? ctx.colors.accent : ctx.colors.context
    return {
      type: 'line',
      name: s.name,
      data: s.values,
      xAxisIndex: k,
      yAxisIndex: k,
      color,
      z: isHighlight ? 3 : 2,
      // Missing values stay gaps.
      connectNulls: false,
      showSymbol: showSymbols && isHighlight,
      symbolSize: 7,
      itemStyle: { borderColor: ctx.colors.surface, borderWidth: 2 },
      lineStyle: { width: isHighlight ? 2 : 1.5 },
      // Unordered lines are named where they end, so the gray ones need no legend.
      endLabel: labelled && !solo ? { show: true, formatter: '{a}', distance: 6, fontSize: 11, color: isHighlight ? ctx.colors.text : ctx.colors.textMuted, fontWeight: isHighlight ? 600 : 400 } : undefined,
      emphasis: { focus: 'series' },
    }
  })
  return {
    height: top + groups.length * (panelHeight + gap) - gap + 36,
    option: {
      grid: grids,
      legend: hasLegend ? legend(p.series.map((s) => s.name), ctx) : undefined,
      tooltip: { ...axisTooltip(p, ctx, p.series.map((_, i) => i)), axisPointer: { type: 'line', link: [{ xAxisIndex: 'all' }] } },
      xAxis: xAxes,
      yAxis: yAxes,
      series,
    },
  }
}

/** One small line chart per series on a shared scale, with the other series faintly behind for comparison. */
function lineMultiples(p: Pivot, ctx: BuildContext): BuiltChart {
  const unit = p.series[0]?.unit ?? NO_UNIT
  const values = p.series.flatMap((s) => s.values).filter((v): v is number => v !== null)
  const shared = niceRange(Math.min(...values), Math.max(...values), values.every((v) => v >= 0))
  const { panels, bottom } = layoutPanels(p.series.length, ctx, 8, 170)
  const grids: GridComponentOption[] = panels.map((panel) => ({ ...panel, top: panel.top + 22, height: panel.height - 22, containLabel: true }))
  const refs: number[] = []
  const series: LineSeriesOption[] = []
  panels.forEach((_, k) => {
    p.series.forEach((s, i) => {
      if (i === k) return
      refs.push(-1)
      series.push({ type: 'line', name: s.name, data: s.values, xAxisIndex: k, yAxisIndex: k, color: ctx.colors.context, showSymbol: false, silent: true, z: 1, lineStyle: { width: 1, opacity: 0.6 }, tooltip: { show: false }, emphasis: { disabled: true } })
    })
    refs.push(k)
    series.push({ type: 'line', name: p.series[k].name, data: p.series[k].values, xAxisIndex: k, yAxisIndex: k, color: ctx.colors.accent, z: 3, connectNulls: false, showSymbol: p.xKeys.length <= 24, symbolSize: 6, itemStyle: { borderColor: ctx.colors.surface, borderWidth: 2 }, lineStyle: { width: 2 } })
  })
  return {
    height: bottom + 16,
    multiples: true,
    option: {
      grid: grids,
      tooltip: { ...axisTooltip(p, ctx, refs), axisPointer: { type: 'line' } },
      xAxis: panels.map((_, k) => ({ type: 'category' as const, gridIndex: k, data: p.xLabels, boundaryGap: false, axisLabel: { hideOverlap: true } })),
      yAxis: panels.map((_, k) => ({
        type: 'value' as const,
        gridIndex: k,
        min: shared[0],
        max: shared[1],
        splitNumber: 3,
        name: p.series[k].name,
        nameLocation: 'end' as const,
        nameGap: 8,
        nameTextStyle: { align: 'left' as const, color: ctx.colors.text, fontWeight: 600, padding: [0, 0, 0, -8] },
        axisLabel: { formatter: (v: number) => formatTick(v, unit, ctx.lang) },
      })),
      series,
    },
  }
}

// ---- scatter ----

function scatterChart(rec: Recommendation, table: Table, ctx: BuildContext): BuiltChart {
  const [mx, my] = rec.measures
  const { rowCount } = chartColumns(table)
  const label = rec.label
  const points: { value: [number, number]; name: string }[] = []
  for (let row = 0; row < rowCount; row++) {
    const [vx, vy] = [mx.values[row], my.values[row]]
    if (vx === null || vy === null) continue
    points.push({ value: [vx, vy], name: label ? keyLabel(label, keyOf(label, row) ?? '', ctx.lang) : '' })
  }
  const axis = (m: Column) => ({
    type: 'value' as const,
    scale: true,
    name: axisName(columnLabel(m, ctx.labels), m.unit, ctx.lang),
    nameLocation: 'middle' as const,
    nameGap: 32,
    splitLine: { show: true, lineStyle: { color: ctx.colors.grid } },
    axisLabel: { formatter: (v: number) => formatTick(v, m.unit, ctx.lang) },
  })
  return {
    height: 360,
    option: {
      grid: { left: 24, right: 24, top: 24, bottom: 24, containLabel: true },
      tooltip: {
        trigger: 'item',
        formatter: (item: unknown) => {
          const { name, value } = item as { name: string; value: [number, number] }
          return `${name ? `<div style="margin-bottom:4px"><b>${escapeHtml(name)}</b></div>` : ''}${tooltipRow(ctx.colors.accent, columnLabel(mx, ctx.labels), formatValue(value[0], mx.unit, ctx.lang))}${tooltipRow(ctx.colors.accent, columnLabel(my, ctx.labels), formatValue(value[1], my.unit, ctx.lang))}`
        },
      },
      xAxis: axis(mx),
      yAxis: { ...axis(my), nameLocation: 'end', nameGap: 12, nameTextStyle: { align: 'left', padding: [0, 0, 0, -8] } },
      series: [
        {
          type: 'scatter',
          data: points,
          color: ctx.colors.accent,
          symbolSize: 10,
          itemStyle: { borderColor: ctx.colors.surface, borderWidth: 2, opacity: 0.9 },
          label: {
            show: points.length <= 15 && Boolean(label),
            position: 'right',
            formatter: '{b}',
            color: ctx.colors.textMuted,
            fontSize: 11,
          },
          labelLayout: { hideOverlap: true },
        },
      ],
    },
  }
}

// ---- heatmap ----

function heatmapChart(rec: Recommendation, table: Table, ctx: BuildContext): BuiltChart {
  // The x/series pivot, laid out as columns × rows; every row is kept.
  const p = pivot(rec, table, ctx, Infinity)
  const rows = p.series
  const unit = rows[0]?.unit ?? NO_UNIT
  const data: [number, number, number | null][] = []
  let [min, max] = [Infinity, -Infinity]
  rows.forEach((s, y) =>
    s.values.forEach((v, x) => {
      if (v === null) return // missing cells are left blank
      data.push([x, y, v])
      min = Math.min(min, v)
      max = Math.max(max, v)
    }),
  )
  const rowLabels = rows.map((s) => s.name)
  // Rows in natural order read top-down.
  const height = Math.max(240, rowLabels.length * 30 + 110)
  return {
    height,
    option: {
      grid: { left: 8, right: 16, top: 24, bottom: 64, containLabel: true },
      tooltip: {
        trigger: 'item',
        formatter: (item: unknown) => {
          const { value } = item as { value: [number, number, number] }
          return `<div style="margin-bottom:4px;color:${ctx.colors.textMuted}">${escapeHtml(rowLabels[value[1]])} · ${escapeHtml(p.xLabels[value[0]])}</div><b>${escapeHtml(formatValue(value[2], unit, ctx.lang))}</b>`
        },
      },
      xAxis: { type: 'category', data: p.xLabels, name: columnLabel(rec.x, ctx.labels), nameLocation: 'middle', nameGap: 26, axisLine: { show: false }, axisLabel: { hideOverlap: true }, splitArea: { show: false } },
      yAxis: { type: 'category', data: rowLabels, name: rec.series ? columnLabel(rec.series, ctx.labels) : '', nameLocation: 'end', nameTextStyle: { align: 'right' }, inverse: true, axisLine: { show: false }, splitArea: { show: false } },
      visualMap: {
        min: Number.isFinite(min) ? Math.min(0, min) : 0,
        max: Number.isFinite(max) ? max : 1,
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        itemWidth: 10,
        itemHeight: 160,
        inRange: { color: ctx.colors.sequential },
        text: [formatTick(Number.isFinite(max) ? max : 1, unit, ctx.lang), formatTick(Math.min(0, Number.isFinite(min) ? min : 0), unit, ctx.lang)],
        textStyle: { color: ctx.colors.textMuted, fontSize: 11 },
      },
      series: [
        {
          type: 'heatmap',
          data,
          itemStyle: { borderColor: ctx.colors.surface, borderWidth: 2, borderRadius: 3 },
          emphasis: { itemStyle: { borderColor: ctx.colors.text, borderWidth: 1 } },
        },
      ],
    },
  }
}

// ---- donut ----

function donutChart(rec: Recommendation, table: Table, ctx: BuildContext): BuiltChart {
  const p = pivot(rec, table, ctx)
  const s = p.series[0]
  let slices: { name: string; value: number; itemStyle?: { color: string } }[] = p.xLabels
    .map((name, i) => ({ name, value: s.values[i] }))
    .filter((slice): slice is { name: string; value: number } => slice.value !== null && slice.value > 0)
    .sort((a, b) => b.value - a.value)
  // Up to five ramp steps, the largest slice darkest; the rest fold into a gray "Other".
  const folded = slices.length > MAX_RAMP
  if (folded) {
    const rest = slices.slice(MAX_RAMP - 1)
    slices = [...slices.slice(0, MAX_RAMP - 1), { name: ctx.labels.other, value: rest.reduce((acc, r) => acc + r.value, 0) }]
  }
  const colors = rampColors(folded ? slices.length - 1 : slices.length, ctx).reverse()
  slices = slices.map((slice, i) => ({ ...slice, itemStyle: { color: colors[i] ?? ctx.colors.context } }))
  return {
    height: 320,
    option: {
      tooltip: {
        trigger: 'item',
        formatter: (item: unknown) => {
          const { name, value, percent, color } = item as { name: string; value: number; percent: number; color: string }
          return tooltipRow(color, name, `${formatValue(value, s.unit, ctx.lang)} · ${percent.toFixed(1)}%`)
        },
      },
      series: [
        {
          type: 'pie',
          radius: ['52%', '74%'],
          center: ['50%', '52%'],
          data: slices,
          startAngle: 90,
          itemStyle: { borderColor: ctx.colors.surface, borderWidth: 2, borderRadius: 4 },
          label: { color: ctx.colors.text, fontSize: 12, formatter: (item: { name: string; percent?: number }) => `${item.name}\n{pct|${(item.percent ?? 0).toFixed(1)}%}`, rich: { pct: { color: ctx.colors.textMuted, fontSize: 11, padding: [3, 0, 0, 0] } } },
          labelLine: { lineStyle: { color: ctx.colors.axis }, length: 10, length2: 12 },
          emphasis: { scale: false },
        },
      ],
    },
  }
}

// ---- timeline ----

function timelineChart(rec: Recommendation, table: Table, ctx: BuildContext): BuiltChart {
  const { rowCount } = chartColumns(table)
  const when = rec.x!
  const label = rec.label
  const rows: { name: string; start: number; end: number }[] = []
  for (let row = 0; row < rowCount; row++) {
    const range = when.type === 'range' ? when.ranges[row] : when.values[row] !== null ? ([when.values[row]!, when.values[row]!] as [number, number]) : null
    if (!range) continue
    rows.push({ name: label?.text[row] || String(row + 1), start: range[0], end: range[1] })
  }
  const names = rows.map((r) => r.name)
  const start = Math.min(...rows.map((r) => r.start))
  const end = Math.max(...rows.map((r) => r.end))
  const span = end - start
  const pad = Math.max(span * 0.04, 864e5)
  const tickGrain = span > 3 * 365 * 864e5 ? 'year' : span > 90 * 864e5 ? 'month' : 'day'
  const points = when.type !== 'range'

  const renderItem = (params: CustomSeriesRenderItemParams, api: CustomSeriesRenderItemAPI) => {
    const y = api.value(2) as number
    const from = api.coord([api.value(0), y])
    const to = api.coord([api.value(1), y])
    const band = api.size ? (api.size([0, 1]) as number[])[1] : 30
    const h = Math.min(18, band * 0.6)
    const coord = params.coordSys as unknown as { x: number; y: number; width: number; height: number }
    const x0 = Math.max(from[0], coord.x)
    const x1 = Math.min(Math.max(to[0], from[0] + 3), coord.x + coord.width)
    return { type: 'rect' as const, shape: { x: x0, y: from[1] - h / 2, width: x1 - x0, height: h, r: 4 }, style: api.style() }
  }

  const series = points
    ? ({
        type: 'scatter',
        color: ctx.colors.accent,
        symbolSize: 11,
        itemStyle: { borderColor: ctx.colors.surface, borderWidth: 2 },
        data: rows.map((r, i) => ({ value: [r.start, i], name: r.name })),
      } satisfies ScatterSeriesOption)
    : ({
        type: 'custom',
        color: ctx.colors.accent,
        renderItem,
        encode: { x: [0, 1], y: 2 },
        data: rows.map((r, i) => [r.start, r.end, i]),
      } satisfies CustomSeriesOption)
  return {
    height: Math.max(200, rows.length * 36 + 64),
    option: {
      // Dates are stored as UTC days; read them that way in every time zone.
      useUTC: true,
      grid: { left: 8, right: 24, top: 12, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'item',
        formatter: (item: unknown) => {
          const { value, color } = item as { value: number[]; color: string }
          const r = rows[points ? value[1] : value[2]]
          const fmt = (t: number) => formatDate(t, tickGrain === 'year' ? 'month' : 'day', ctx.lang)
          // The range end is exclusive; show the last day it covers.
          const range = points ? fmt(r.start) : `${fmt(r.start)} – ${fmt(r.end - 864e5)}`
          return tooltipRow(color, r.name, range)
        },
      },
      xAxis: {
        type: 'time',
        min: start - pad,
        max: end + pad,
        splitLine: { show: true, lineStyle: { color: ctx.colors.grid } },
        // Each tick in its own unit: 2024年 / 3月 / 3月15日.
        axisLabel: {
          hideOverlap: true,
          formatter:
            ctx.lang === 'zh-CN'
              ? { year: '{yyyy}年', month: '{M}月', day: '{M}月{d}日', hour: '{HH}:{mm}', minute: '{HH}:{mm}' }
              : { year: '{yyyy}', month: '{MMM}', day: '{MMM} {d}', hour: '{HH}:{mm}', minute: '{HH}:{mm}' },
        },
      },
      yAxis: { type: 'category', data: names, inverse: true, axisLine: { show: false }, axisLabel: { width: 160, overflow: 'truncate' } },
      series: [series],
    },
  }
}

export function buildChart(rec: Recommendation, table: Table, ctx: BuildContext): BuiltChart {
  const built = drawChart(rec, table, ctx)
  // Quiet: a short fade-in, no long drawing animation.
  built.option = { animationDuration: 250, animationDurationUpdate: 200, ...built.option }
  return built
}

function drawChart(rec: Recommendation, table: Table, ctx: BuildContext): BuiltChart {
  switch (rec.type) {
    case 'bar':
    case 'bar-grouped':
    case 'bar-stacked':
      return barChart(rec, table, ctx)
    case 'line':
      return lineChart(rec, table, ctx)
    case 'scatter':
      return scatterChart(rec, table, ctx)
    case 'heatmap':
      return heatmapChart(rec, table, ctx)
    case 'donut':
      return donutChart(rec, table, ctx)
    case 'timeline':
      return timelineChart(rec, table, ctx)
  }
}
