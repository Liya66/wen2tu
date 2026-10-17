/**
 * Turns pasted text into typed columns: each column becomes a category,
 * a number with a unit, a date/period, or a start–end range, and the table
 * is classified as long (one value column per variable) or wide (one
 * variable spread over several columns, e.g. a column per month).
 */
import { extractGrid, type SourceFormat } from './extract'
import { parseSqlHints, type Aggregate, type SqlHints } from './sqlHints'
import { SCALES, parseCell, parseDate, periodEnd, type Cell, type Grain } from './values'

export type ColumnType = 'category' | 'number' | 'date' | 'range'
/** What a column does in a chart. `total` and `id` columns are kept out of the marks. */
export type ColumnRole = 'dimension' | 'measure' | 'total' | 'id'

export interface Unit {
  /** Currency written before the number: ¥, $, €. */
  prefix: string
  /** Unit written after it: 元, 人, kg. */
  suffix: string
  percent: boolean
}

export interface Column {
  name: string
  /** The header without a unit note such as "（万元）". */
  label: string
  type: ColumnType
  role: ColumnRole
  unit: Unit
  /** Numbers for `number`, timestamps (UTC ms) for `date`; null where missing. */
  values: (number | null)[]
  /** Start and end (exclusive) for `range`. */
  ranges: ([number, number] | null)[]
  /** The cell text, cleaned. */
  text: string[]
  grain?: Grain
  /** Dates given without a year (Q1, 3月). */
  yearless?: boolean
  /**
   * For categories: a sort key per row when the values have a natural order
   * (weekdays, sizes, age bands, the order a SQL query asked for).
   */
  orderKey?: number[]
  aggregate?: Aggregate
}

export type Shape = 'long' | 'wide'

export interface Table {
  format: SourceFormat
  columns: Column[]
  rowCount: number
  shape: Shape
  /** For a wide table whose column headers are periods: the same data unpivoted to long form. */
  melted?: { from: string[]; columns: Column[]; rowCount: number }
  sql?: SqlHints
  notes: Note[]
}

export type Note =
  | { code: 'ignored-lines'; count: number }
  | { code: 'dropped-summary-rows'; labels: string[] }
  | { code: 'total-column'; column: string }
  | { code: 'sql-used' }

const SUMMARY = /^(?:合计|总计|总和|小计|共计|总数|汇总|平均|平均值|均值|total|totals|grand\s+total|sum|subtotal|average|avg|mean|overall)[:：]?$/i
const ID_NAME = /^(?:id|uuid|编号|序号|no\.?|#|code|代码|编码|邮编|zip|电话|phone|sku|rank|ranking|排名|名次)$|(?:_id|编号|id)$/i
const NUMERIC_DIMENSION = /^(?:hour|hr|小时|时段|时|weekday|dow|day_of_week|星期|week|周|周次|day|日|月|月份|month|quarter|季度|level|等级|年龄段|age_group)$/i
const YEAR_NAME = /^(?:year|yr|fy|年|年份|年度)$/i
const START_NAME = /^(?:start|start_date|begin|from|开始|开始时间|开始日期|起始|起始日期|起|计划开始)$|(?:开始|start)/i
const END_NAME = /^(?:end|end_date|finish|to|until|due|结束|结束时间|结束日期|截止|截止日期|止|计划结束)$|(?:结束|截止|end|finish)/i

export function analyzeText(text: string): Table | null {
  const grid = extractGrid(text)
  if (!grid) return null
  const sql = grid.sql ? (parseSqlHints(grid.sql) ?? undefined) : undefined
  const notes: Note[] = []
  if (grid.ignoredLines > 0) notes.push({ code: 'ignored-lines', count: grid.ignoredLines })

  let header = grid.header
  let rows = grid.rows
  // No header row: the first row is data.
  if (header.every((cell) => parseCell(cell).kind === 'number')) {
    rows = [header, ...rows]
    header = header.map((_, i) => `#${i + 1}`)
  }

  // Total, subtotal and average rows would dwarf every other bar.
  const summary = (row: string[]) => row.find((cell) => SUMMARY.test(cell))
  const dropped = rows.map(summary).filter((label): label is string => label !== undefined)
  if (dropped.length && rows.length - dropped.length >= 2) {
    rows = rows.filter((row) => !summary(row))
    notes.push({ code: 'dropped-summary-rows', labels: dropped })
  }

  const columns = header.map((name, c) => buildColumn(name, rows.map((row) => row[c] ?? ''), sql))
  assignYearColumn(columns)
  pairStartEnd(columns)
  markTotals(columns, notes)
  if (sql && columns.some((col) => sql.outputs.includes(col.name.toLowerCase()))) notes.push({ code: 'sql-used' })

  const table: Table = { format: grid.format, columns, rowCount: rows.length, shape: 'long', sql, notes }
  const melted = meltPeriodHeaders(columns, rows.length)
  if (melted) {
    table.shape = 'wide'
    table.melted = melted
  } else {
    const measures = columns.filter((col) => col.role === 'measure')
    const dims = columns.filter((col) => col.role === 'dimension')
    // One variable spread over several same-unit columns (线上 | 线下 …).
    if (measures.length >= 2 && dims.length <= 1 && sameUnit(measures) && !measures.some((m) => m.aggregate === 'avg'))
      table.shape = 'wide'
  }
  return table
}

/** Columns to chart: the long form when a wide table was unpivoted. */
export function chartColumns(table: Table): { columns: Column[]; rowCount: number } {
  return table.melted ?? table
}

export function sameUnit(columns: Column[]): boolean {
  const key = (col: Column) => `${col.unit.prefix}|${col.unit.suffix}|${col.unit.percent}`
  return columns.every((col) => key(col) === key(columns[0]))
}

// ---- header units ----

interface HeaderUnit {
  label: string
  scale: number
  unit: Unit
}

const UNIT_WORDS = /^(?:元|美元|人民币|人|人次|次|个|件|台|辆|吨|千克|kg|km|m|ms|s|秒|分钟|小时|天|岁|年|户|家|篇|条|单|笔|份|套|pts|points|users|years|days|hours|mins|minutes)$/i

export function readHeaderUnit(name: string): HeaderUnit {
  const plain: HeaderUnit = { label: name.trim(), scale: 1, unit: { prefix: '', suffix: '', percent: false } }
  const m = name.trim().match(/^(.*?)\s*(?:[（([]\s*([^）)\]]+?)\s*[）)\]]|[/／,，]\s*([^/／,，]+))\s*$/)
  if (!m) return plain
  let inner = (m[2] ?? m[3]).trim()
  const unit: Unit = { prefix: '', suffix: '', percent: false }
  let scale = 1
  let found = false
  const currency = inner.match(/^(?:[¥￥$€£]|RMB|CNY|USD|US\$)\s*/i)
  if (currency) {
    unit.prefix = /[$]|USD/i.test(currency[0]) ? '$' : /€/.test(currency[0]) ? '€' : '¥'
    inner = inner.slice(currency[0].length)
    found = true
  }
  const scaleWord = inner.match(/^(万亿|千万|百万|十万|亿|万|千|MM|mn|bn|[kKMB](?![a-z]))/)
  if (scaleWord) {
    scale = SCALES[scaleWord[1]]
    inner = inner.slice(scaleWord[1].length).trim()
    found = true
  }
  if (/^[%％]$/.test(inner)) {
    unit.percent = true
    inner = ''
    found = true
  }
  if (inner) {
    if (!UNIT_WORDS.test(inner) && !/^(?:USD|RMB|CNY|EUR)$/i.test(inner)) return plain
    if (/^(?:美元|USD)$/i.test(inner)) unit.prefix = '$'
    else if (/^(?:RMB|CNY|人民币)$/i.test(inner)) unit.suffix = '元'
    else unit.suffix = inner
    found = true
  }
  return found ? { label: m[1].trim() || name.trim(), scale, unit } : plain
}

// ---- columns ----

function share<T>(items: T[], test: (item: T) => boolean): number {
  return items.length ? items.filter(test).length / items.length : 0
}

function mostCommon<T>(items: T[]): T | undefined {
  const counts = new Map<T, number>()
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1)
  let best: T | undefined
  let bestCount = 0
  for (const [item, count] of counts) if (count > bestCount) [best, bestCount] = [item, count]
  return best
}

function buildColumn(name: string, raw: string[], sql?: SqlHints): Column {
  const header = readHeaderUnit(name)
  const cells = raw.map(parseCell)
  const present = cells.filter((cell) => cell.kind !== 'missing')
  const sqlName = name.trim().toLowerCase()
  const aggregate = sql?.aggregates[sqlName]
  const grouped = sql?.groupBy.includes(sqlName) ?? false
  const base = {
    name,
    label: header.label,
    text: raw.map((cell) => cell.trim()),
    ranges: cells.map(() => null),
    aggregate,
  }

  const kindShare = (kind: Cell['kind']) => share(present, (cell) => cell.kind === kind)
  if (present.length && kindShare('range') >= 0.8) {
    return {
      ...base,
      type: 'range',
      role: 'dimension',
      unit: header.unit,
      values: cells.map(() => null),
      ranges: cells.map((cell) => (cell.kind === 'range' ? [cell.start, cell.end] : null)),
      grain: mostCommon(present.flatMap((cell) => (cell.kind === 'range' ? [cell.grain] : []))),
    }
  }
  if (present.length && kindShare('date') >= 0.8 && !aggregate) {
    const dates = present.filter((cell): cell is Extract<Cell, { kind: 'date' }> => cell.kind === 'date')
    let grain = mostCommon(dates.map((cell) => cell.grain))
    // 2024-01-01, 2024-02-01, …: monthly data written as days.
    if (grain === 'day' && dates.length > 2 && dates.every((cell) => new Date(cell.t).getUTCDate() === 1)) grain = 'month'
    return {
      ...base,
      type: 'date',
      role: 'dimension',
      unit: header.unit,
      values: cells.map((cell) => (cell.kind === 'date' ? cell.t : null)),
      grain,
      yearless: dates.some((cell) => cell.yearless),
    }
  }
  const numbers = present.filter((cell): cell is Extract<Cell, { kind: 'number' }> => cell.kind === 'number')
  const unitKey = (cell: (typeof numbers)[number]) => `${cell.prefix}|${cell.suffix}|${cell.percent}`
  const commonUnit = mostCommon(numbers.map(unitKey))
  if (present.length && numbers.length / present.length >= 0.8 && share(numbers, (cell) => unitKey(cell) === commonUnit) >= 0.8) {
    const sample = numbers.find((cell) => unitKey(cell) === commonUnit)!
    const unit: Unit = {
      prefix: sample.prefix || header.unit.prefix,
      suffix: sample.suffix || header.unit.suffix,
      percent: sample.percent || header.unit.percent,
    }
    const values = cells.map((cell) => {
      if (cell.kind !== 'number') return null
      let value = cell.value
      if (!cell.scaled) value *= header.scale
      if (header.unit.percent && !cell.percent) value /= 100
      return value
    })
    const integers = numbers.every((cell) => Number.isInteger(cell.value))
    const column: Column = { ...base, type: 'number', role: 'measure', unit, values }
    const timePart = sql?.timeParts[sqlName]
    if (ID_NAME.test(header.label)) column.role = 'id'
    else if (!aggregate && integers && (grouped || NUMERIC_DIMENSION.test(header.label) || YEAR_NAME.test(header.label) || timePart)) {
      // A number used as a label: an hour, a year, a rank. Keep it in numeric order.
      if (isYears(values) && (YEAR_NAME.test(header.label) || /year/i.test(sqlName))) return asYears(column)
      return {
        ...column,
        type: 'category',
        role: 'dimension',
        unit: { prefix: '', suffix: '', percent: false },
        orderKey: values.map((v) => v ?? Number.POSITIVE_INFINITY),
      }
    }
    return column
  }

  const orderKey = naturalOrder(base.text, sql, sqlName)
  return { ...base, type: 'category', role: 'dimension', unit: header.unit, values: cells.map(() => null), orderKey }
}

function isYears(values: (number | null)[]): boolean {
  const present = values.filter((v): v is number => v !== null)
  return present.length > 0 && present.every((v) => Number.isInteger(v) && v >= 1900 && v <= 2100)
}

function asYears(column: Column): Column {
  return {
    ...column,
    type: 'date',
    role: 'dimension',
    grain: 'year',
    unit: { prefix: '', suffix: '', percent: false },
    values: column.values.map((v) => (v === null ? null : Date.UTC(v, 0, 1))),
  }
}

/** A first column of distinct years (2019, 2020, …) beside measures is a time axis, not a measure. */
function assignYearColumn(columns: Column[]) {
  const first = columns[0]
  if (!first || first.type !== 'number' || first.role !== 'measure' || first.aggregate) return
  const present = first.values.filter((v): v is number => v !== null)
  const distinct = new Set(present).size === present.length
  if (isYears(first.values) && distinct && columns.slice(1).some((col) => col.role === 'measure')) columns[0] = asYears(first)
}

/** Two date columns named start/end (开始/结束) become one range column. */
function pairStartEnd(columns: Column[]) {
  const dates = columns.filter((col) => col.type === 'date')
  if (dates.length !== 2) return
  let [start, end] = dates
  if (START_NAME.test(end.label) && END_NAME.test(start.label)) [start, end] = [end, start]
  const named = START_NAME.test(start.label) && END_NAME.test(end.label)
  const ordered = start.values.every((s, i) => s === null || end.values[i] === null || end.values[i]! >= s)
  if (!named && !ordered) return
  if (!named && start.grain !== 'day' && start.grain !== 'time') return
  const grain = end.grain ?? 'day'
  const range: Column = {
    name: `${start.name} – ${end.name}`,
    label: `${start.label} – ${end.label}`,
    type: 'range',
    role: 'dimension',
    unit: start.unit,
    values: start.values.map(() => null),
    ranges: start.values.map((s, i) => {
      const e = end.values[i]
      return s === null || e === null ? null : [s, periodEnd(e, grain)]
    }),
    text: start.text.map((s, i) => `${s} – ${end.text[i]}`),
    grain: start.grain,
  }
  const at = columns.indexOf(start)
  columns.splice(columns.indexOf(end), 1)
  columns.splice(at, 1, range)
}

/** A measure named "合计/Total", or one that equals the sum of the other same-unit measures, is a total. */
function markTotals(columns: Column[], notes: Note[]) {
  const measures = columns.filter((col) => col.role === 'measure')
  if (measures.length < 3) return
  for (const candidate of measures) {
    const others = measures.filter((col) => col !== candidate && sameUnit([col, candidate]))
    if (others.length < 2) continue
    let matches = 0
    let rows = 0
    candidate.values.forEach((value, i) => {
      if (value === null) return
      rows++
      const sum = others.reduce((acc, col) => acc + (col.values[i] ?? 0), 0)
      if (Math.abs(sum - value) <= Math.max(1e-9, Math.abs(value) * 0.005)) matches++
    })
    if (SUMMARY.test(candidate.label) || (rows > 0 && matches / rows >= 0.9)) {
      candidate.role = 'total'
      notes.push({ code: 'total-column', column: candidate.name })
      return
    }
  }
}

// ---- natural order of categories ----

const SEQUENCES: string[][] = [
  ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
  ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'],
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
  ['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl'],
  ['低', '中', '高'],
  ['low', 'medium', 'high'],
  ['非常不满意', '不满意', '一般', '满意', '非常满意'],
  ['strongly disagree', 'disagree', 'neutral', 'agree', 'strongly agree'],
  ['上旬', '中旬', '下旬'],
  ['上半年', '下半年'],
  ['h1', 'h2'],
]

function naturalOrder(text: string[], sql: SqlHints | undefined, sqlName: string): number[] | undefined {
  const values = text.filter(Boolean)
  if (!values.length) return undefined
  const lower = values.map((v) => v.toLowerCase())
  for (const sequence of SEQUENCES) {
    if (lower.every((v) => sequence.includes(v))) return text.map((v) => sequence.indexOf(v.toLowerCase()))
  }
  // Bands that start with a number: "18-24", "25–34", "<1万", "55+".
  const lead = (v: string) => {
    const m = v.match(/^[<≤>≥]?\s*[¥$]?(\d+(?:\.\d+)?)\s*(万|k|K)?/)
    if (!m) return null
    const n = Number(m[1]) * (m[2] === '万' ? 1e4 : m[2] ? 1e3 : 1)
    return /^[<≤]/.test(v) ? n - 0.5 : n
  }
  if (values.every((v) => lead(v) !== null) && values.some((v) => /\D/.test(v))) return text.map((v) => lead(v) ?? Infinity)
  // The query sorted by this column: keep its order.
  if (sql?.orderBy[0]?.name === sqlName) return text.map((_, i) => i)
  return undefined
}

// ---- wide tables with periods as column headers ----

function meltPeriodHeaders(columns: Column[], rowCount: number): Table['melted'] | undefined {
  const measures = columns.filter((col) => col.role === 'measure' || col.role === 'total')
  const periodOf = (col: Column) => parseDate(col.label) ?? (/^\d{4}$/.test(col.label.trim()) ? { t: Date.UTC(+col.label, 0, 1), grain: 'year' as Grain, yearless: false } : null)
  const periods = measures.filter((col) => col.role === 'measure' && periodOf(col))
  if (periods.length < 2 || periods.length < measures.filter((col) => col.role === 'measure').length * 0.6) return undefined
  if (!sameUnit(periods)) return undefined
  const dims = columns.filter((col) => col.role === 'dimension' && col.type !== 'range')
  const first = periodOf(periods[0])!
  const time: Column = {
    name: '__period',
    label: '',
    type: 'date',
    role: 'dimension',
    unit: { prefix: '', suffix: '', percent: false },
    values: [],
    ranges: [],
    text: [],
    grain: first.grain,
    yearless: periods.some((col) => periodOf(col)!.yearless),
  }
  const value: Column = {
    name: '__value',
    label: '',
    type: 'number',
    role: 'measure',
    unit: periods[0].unit,
    values: [],
    ranges: [],
    text: [],
  }
  const meltedDims = dims.map((dim) => ({ ...dim, values: [] as (number | null)[], ranges: [] as Column['ranges'], text: [] as string[], orderKey: dim.orderKey ? ([] as number[]) : undefined }))
  for (let row = 0; row < rowCount; row++) {
    for (const col of periods) {
      meltedDims.forEach((dim, d) => {
        dim.values.push(dims[d].values[row])
        dim.ranges.push(null)
        dim.text.push(dims[d].text[row])
        dim.orderKey?.push(dims[d].orderKey![row])
      })
      time.values.push(periodOf(col)!.t)
      time.ranges.push(null)
      time.text.push(col.label)
      value.values.push(col.values[row])
      value.ranges.push(null)
      value.text.push(col.text[row])
    }
  }
  return { from: periods.map((col) => col.name), columns: [...meltedDims, time, value], rowCount: rowCount * periods.length }
}
