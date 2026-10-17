/**
 * Ranks chart types for an analysed table. Each rule looks at the columns'
 * types and roles (and SQL hints, when a query came with the paste) and
 * proposes a chart with a score; the best-scoring distinct charts win.
 */
import { chartColumns, sameUnit, type Column, type Table } from './table'

export type ChartType = 'bar' | 'bar-grouped' | 'bar-stacked' | 'line' | 'scatter' | 'heatmap' | 'donut' | 'timeline'

export type Reason =
  | 'time-series'
  | 'few-periods'
  | 'compare-categories'
  | 'ranked-top-n'
  | 'parts-of-whole'
  | 'compare-groups'
  | 'two-measures'
  | 'matrix'
  | 'schedule'
  | 'events'
  | 'composition-over-time'
  | 'alternative'

export interface Recommendation {
  type: ChartType
  score: number
  reason: Reason
  /** Category or time axis. */
  x?: Column
  /** Splits the measure into series (a second dimension). */
  series?: Column
  /** Values. Several measures with one unit become several series. */
  measures: Column[]
  /** Scatter: the label column for points. Timeline: the bar label. */
  label?: Column
  /** Bars laid out sideways (long labels, many categories). */
  horizontal?: boolean
}

const PART_NAME = /占比|比例|比重|份额|构成|分布|share|percent|proportion|mix|breakdown/i
const LONG_LABEL = 14

function distinct(col: Column): number {
  const keys: unknown[] = col.type === 'number' || col.type === 'date' ? col.values.filter((v) => v !== null) : col.text.filter(Boolean)
  return new Set(keys).size
}

function displayLength(text: string): number {
  // CJK characters are about twice as wide as Latin ones.
  let n = 0
  for (const ch of text) n += /[　-鿿＀-￯]/.test(ch) ? 2 : 1
  return n
}

function maxLabelLength(col: Column): number {
  return Math.max(0, ...col.text.map(displayLength))
}

function allNonNegative(cols: Column[]): boolean {
  return cols.every((col) => col.values.every((v) => v === null || v >= 0))
}

/** Values that add up to a whole: shares, a total column, percentages summing to ~100%. */
function partsOfWhole(table: Table, measures: Column[], rowCount: number, groupBy?: Column, across?: Column): boolean {
  if (!allNonNegative(measures)) return false
  if (measures.some((m) => m.aggregate === 'avg' || m.aggregate === 'min' || m.aggregate === 'max')) return false
  // A total column of a period-per-column table sums over time, not over the series.
  if (!table.melted && table.columns.some((col) => col.role === 'total')) return true
  if (measures.some((m) => PART_NAME.test(m.label))) return true
  const percent = measures.every((m) => m.unit.percent)
  if (!percent) return false
  // Percentages that sum to ~100% across one row (wide) or down the column (long).
  if (measures.length >= 2) {
    const sums = Array.from({ length: rowCount }, (_, i) => measures.reduce((acc, m) => acc + (m.values[i] ?? 0), 0))
    return sums.every((s) => Math.abs(s - 1) < 0.02)
  }
  if (groupBy) {
    // Long form: shares of each group that sum to ~100% within every period.
    if (!across) return false
    const sums = new Map<string, number>()
    measures[0].values.forEach((v, i) => sums.set(across.text[i], (sums.get(across.text[i]) ?? 0) + (v ?? 0)))
    return [...sums.values()].every((sum) => Math.abs(sum - 1) < 0.02)
  }
  const total = measures[0].values.reduce<number>((acc, v) => acc + (v ?? 0), 0)
  return Math.abs(total - 1) < 0.02
}

export function recommend(table: Table): Recommendation[] {
  const { columns, rowCount } = chartColumns(table)
  const dims = columns.filter((col) => col.role === 'dimension')
  const measures = columns.filter((col) => col.role === 'measure')
  const ranges = dims.filter((col) => col.type === 'range')
  const dates = dims.filter((col) => col.type === 'date')
  const categories = dims.filter((col) => col.type === 'category')
  const out: Recommendation[] = []
  const add = (rec: Recommendation) => out.push(rec)
  const sql = table.sql
  const topN = Boolean(sql?.limit && sql.orderBy.some((o) => measures.some((m) => m.name.toLowerCase() === o.name)))

  // ---- schedules: a start–end range per row ----
  if (ranges.length) {
    const label = categories.find((col) => distinct(col) >= rowCount * 0.6) ?? categories[0]
    add({ type: 'timeline', score: 100, reason: 'schedule', x: ranges[0], label, measures: [] })
  }

  // ---- events: a date per row and a description, no values ----
  if (!ranges.length && dates.length === 1 && !measures.length) {
    const label = categories.find((col) => distinct(col) >= rowCount * 0.8)
    if (label) add({ type: 'timeline', score: 92, reason: 'events', x: dates[0], label, measures: [] })
  }

  if (!measures.length) return finish(out)

  const unitGroup = measures.filter((m) => comparable(m, measures[0]))
  const mixedUnits = unitGroup.length < measures.length

  // ---- change over time ----
  const time = dates[0]
  if (time) {
    const points = distinct(time)
    const other = categories.find((col) => col !== time) ?? dates.find((col) => col !== time)
    const otherCount = other ? distinct(other) : 0
    const parts = partsOfWhole(table, unitGroup, rowCount, other, time)

    if (points >= 4) {
      if (other && otherCount > 8) {
        add({ type: 'heatmap', score: 88, reason: 'matrix', x: time, series: other, measures: [measures[0]] })
        add({ type: 'line', score: 70, reason: 'time-series', x: time, series: other, measures: [measures[0]] })
      } else {
        add({ type: 'line', score: 90, reason: 'time-series', x: time, series: other, measures: other ? [measures[0]] : mixedUnits ? measures : unitGroup })
      }
      if (parts && (other || unitGroup.length >= 2))
        add({ type: 'bar-stacked', score: 94, reason: 'composition-over-time', x: time, series: other, measures: other ? [measures[0]] : unitGroup })
      else if (other && otherCount <= 6 && allNonNegative([measures[0]]))
        add({ type: 'bar-stacked', score: 62, reason: 'alternative', x: time, series: other, measures: [measures[0]] })
      if (!other && unitGroup.length >= 2 && unitGroup.length <= 4)
        add({ type: 'bar-grouped', score: 60, reason: 'alternative', x: time, measures: unitGroup })
      if (!other) add({ type: 'bar', score: 66, reason: 'alternative', x: time, measures: [measures[0]] })
      if (!other && measures.length >= 2 && rowCount >= 8)
        add({ type: 'scatter', score: 55, reason: 'two-measures', measures: measures.slice(0, 2), label: time })
    } else if (other) {
      // Two or three periods: compare them side by side within each group.
      add({ type: 'bar-grouped', score: 88, reason: 'few-periods', x: other, series: time, measures: [measures[0]], horizontal: horizontal(other) })
      add({ type: 'bar-stacked', score: parts ? 89 : 60, reason: parts ? 'parts-of-whole' : 'alternative', x: time, series: other, measures: [measures[0]] })
      // Two or three points per line only work as one chart: skip it when it would split into panels.
      if (otherCount <= 3) add({ type: 'line', score: 58, reason: 'time-series', x: time, series: other, measures: [measures[0]] })
    } else {
      add({ type: 'bar', score: 86, reason: 'few-periods', x: time, measures: [measures[0]] })
      if (unitGroup.length >= 2) add({ type: 'bar-grouped', score: 87, reason: 'compare-groups', x: time, measures: unitGroup })
      add({ type: 'line', score: 50, reason: 'time-series', x: time, measures: unitGroup })
    }
    return finish(out)
  }

  // ---- no dimension: numbers against numbers ----
  if (!categories.length) {
    if (measures.length >= 2) add({ type: 'scatter', score: 90, reason: 'two-measures', measures: measures.slice(0, 2) })
    return finish(out)
  }

  // ---- categories ----
  if (categories.length >= 2) {
    // Two dimensions and a value: groups of bars, or a matrix when both are big.
    const byCount = [...categories].sort((a, b) => distinct(b) - distinct(a))
    const [big, small] = byCount
    const [nBig, nSmall] = [distinct(big), distinct(small)]
    const parts = partsOfWhole(table, [measures[0]], rowCount, small)
    if (nested(big, small)) {
      // Each value of one sits inside one value of the other (city within region): plain bars, coloured by group.
      add({ type: 'bar-stacked', score: 89, reason: 'compare-groups', x: big, series: small, measures: [measures[0]], horizontal: horizontal(big) })
      add({ type: 'heatmap', score: 40, reason: 'matrix', x: big, series: small, measures: [measures[0]] })
    } else if (nSmall >= 5 && nBig >= 5) {
      add({ type: 'heatmap', score: 90, reason: 'matrix', x: big, series: small, measures: [measures[0]] })
      add({ type: 'bar-stacked', score: 60, reason: 'alternative', x: big, series: small, measures: [measures[0]] })
    } else {
      add({ type: 'bar-grouped', score: parts ? 84 : 88, reason: 'compare-groups', x: big, series: small, measures: [measures[0]], horizontal: horizontal(big) })
      add({ type: 'bar-stacked', score: parts ? 89 : 80, reason: parts ? 'parts-of-whole' : 'alternative', x: big, series: small, measures: [measures[0]], horizontal: horizontal(big) })
      add({ type: 'heatmap', score: nSmall >= 3 && nBig >= 4 ? 70 : 40, reason: 'matrix', x: big, series: small, measures: [measures[0]] })
    }
    return finish(out)
  }

  const x = categories[0]
  const n = distinct(x)
  const isLabelColumn = n === rowCount

  if (unitGroup.length >= 2 && !mixedUnits) {
    const parts = partsOfWhole(table, unitGroup, rowCount)
    add({ type: 'bar-grouped', score: parts ? 84 : 88, reason: 'compare-groups', x, measures: unitGroup, horizontal: horizontal(x) })
    add({ type: 'bar-stacked', score: parts ? 92 : 78, reason: parts ? 'parts-of-whole' : 'alternative', x, measures: unitGroup, horizontal: horizontal(x) })
    if (unitGroup.length === 2 && rowCount >= 8) add({ type: 'scatter', score: 70, reason: 'two-measures', measures: unitGroup, label: x })
    if (n >= 5 && unitGroup.length >= 5) add({ type: 'heatmap', score: 86, reason: 'matrix', x, measures: unitGroup })
    return finish(out)
  }

  // One value per category (other measures in other units ride along as alternatives).
  const value = measures[0]
  const parts = partsOfWhole(table, [value], rowCount)
  add({ type: 'bar', score: topN ? 95 : 90, reason: topN ? 'ranked-top-n' : 'compare-categories', x, measures: [value], horizontal: horizontal(x) })
  if (n <= 7 && allNonNegative([value]) && !topN && value.aggregate !== 'avg')
    add({ type: 'donut', score: parts ? 96 : 64, reason: parts ? 'parts-of-whole' : 'alternative', x, measures: [value] })
  if (mixedUnits && isLabelColumn && rowCount >= 6) {
    // A rate beside an amount (GDP and its growth %) is usually a side note; two amounts invite a scatter.
    const second = measures.find((m) => !comparable(m, value))!
    const rates = [value, second].some((m) => m.unit.percent)
    add({ type: 'scatter', score: rates ? 72 : 92, reason: 'two-measures', measures: [value, second], label: x })
    add({ type: 'bar', score: 68, reason: 'alternative', x, measures: [second], horizontal: horizontal(x) })
  }
  return finish(out)
}

function median(col: Column): number {
  const sorted = col.values.filter((v): v is number => v !== null).map(Math.abs).sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

/**
 * Whether two measures can share one value axis: same unit, compatible
 * aggregates (a count and an average are different quantities), and
 * magnitudes within 20× of each other.
 */
export function comparable(a: Column, b: Column): boolean {
  if (a === b) return true
  if (!sameUnit([a, b])) return false
  const kind = (col: Column) => (col.aggregate === 'count' ? 'count' : col.aggregate === 'avg' ? 'avg' : col.aggregate ? 'sum' : '')
  if (kind(a) && kind(b) && kind(a) !== kind(b)) return false
  const [ma, mb] = [median(a), median(b)]
  return !(ma && mb && Math.max(ma, mb) / Math.min(ma, mb) > 20)
}

/** Whether every value of `inner` belongs to a single value of `outer`. */
function nested(inner: Column, outer: Column): boolean {
  const parent = new Map<string, string>()
  for (let i = 0; i < inner.text.length; i++) {
    const seen = parent.get(inner.text[i])
    if (seen !== undefined && seen !== outer.text[i]) return false
    parent.set(inner.text[i], outer.text[i])
  }
  return distinct(outer) > 1 && distinct(outer) < distinct(inner)
}

function horizontal(x: Column): boolean {
  return maxLabelLength(x) > LONG_LABEL || distinct(x) > 12
}

function tooManyToShade(rec: Recommendation): boolean {
  if (!rec.series) return rec.measures.length > 3
  const ordered = rec.series.type === 'date' || Boolean(rec.series.orderKey)
  return distinct(rec.series) > (ordered ? 5 : 3)
}

function finish(out: Recommendation[]): Recommendation[] {
  const seen = new Set<string>()
  return out
    .sort((a, b) => b.score - a.score)
    // A stack or group that one hue can't shade (more than 5 ordered or 3 unordered series)
    // would be drawn as small panels instead: not worth offering as an alternative.
    .filter((rec) => !(rec.reason === 'alternative' && rec.type.startsWith('bar-') && tooManyToShade(rec)))
    .filter((rec) => {
      const key = `${rec.type}|${rec.measures.map((m) => m.name).join(',')}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}
