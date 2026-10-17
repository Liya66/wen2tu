/**
 * Reads single table cells: numbers with units (`1,234`, `12.5%`, `¥3.2万`,
 * `1.2亿`, `$1.2M`), dates and periods (`2024-03`, `2024年3月`, `Q1`, `Jan-24`),
 * date ranges (`2024-03-01 ~ 2024-04-15`) and missing values (`—`, empty).
 */

export type Grain = 'year' | 'quarter' | 'month' | 'week' | 'day' | 'time'

export type Cell =
  | { kind: 'missing' }
  | { kind: 'number'; value: number; prefix: string; suffix: string; percent: boolean; scaled: boolean }
  | { kind: 'date'; t: number; grain: Grain; yearless: boolean }
  | { kind: 'range'; start: number; end: number; grain: Grain }
  | { kind: 'text'; text: string }

const MISSING = /^(?:|[-—–―‒]+|n\/?a|null|none|nan|#n\/a|#div\/0!|#value!|#ref!|\/|暂无|…|\.\.\.|\?)$/i

/** Multipliers written after a number or inside a header unit, e.g. `3.2万`, `(亿元)`, `$1.2M`. */
export const SCALES: Record<string, number> = {
  万亿: 1e12,
  亿: 1e8,
  千万: 1e7,
  百万: 1e6,
  十万: 1e5,
  万: 1e4,
  千: 1e3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  MM: 1e6,
  mn: 1e6,
  B: 1e9,
  bn: 1e9,
}

const CURRENCY = '[¥￥$€£]|RMB|CNY|USD|US\\$|HK\\$|EUR'
const NUMBER = new RegExp(
  '^(?<sign>[-+−]?)\\s*(?<pre>' +
    CURRENCY +
    ')?\\s*(?<sign2>[-+−]?)(?<num>\\d{1,3}(?:[,，]\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?|\\.\\d+)(?:[eE](?<exp>[-+]?\\d+))?' +
    '\\s*(?<scale>万亿|千万|百万|十万|亿|万|千|(?:MM|mn|bn|[kKMB])(?![a-zA-Z]))?\\s*(?<pct>[%％‰])?\\s*(?<suf>[^\\d.,][^\\d]{0,7})?$',
)

export function isMissing(raw: string): boolean {
  return MISSING.test(raw.trim())
}

export function parseNumber(raw: string): Extract<Cell, { kind: 'number' }> | null {
  let text = raw.trim().replace(/ /g, ' ')
  // Accounting negatives: (1,234)
  let negative = false
  const paren = text.match(/^\((.+)\)$/)
  if (paren) {
    text = paren[1]
    negative = true
  }
  let m = text.match(NUMBER)
  // European style, 1.234,50 or 456,20: only when the usual reading fails.
  if (!m && /^[^\d]*\d{1,3}(?:\.\d{3})*,\d+(?!\d)/.test(text)) m = text.replace(/\.(?=\d{3})/g, '').replace(/,(?=\d+\D*$)/, '.').match(NUMBER)
  if (!m?.groups) return null
  const g = m.groups
  let value = Number(g.num.replace(/[,，]/g, ''))
  if (g.exp) value *= 10 ** Number(g.exp)
  if (g.scale) value *= SCALES[g.scale]
  const percent = Boolean(g.pct)
  if (g.pct === '‰') value /= 1000
  else if (percent) value /= 100
  if (negative || /[-−]/.test(g.sign) || /[-−]/.test(g.sign2)) value = -value
  const suffix = (g.suf ?? '').trim()
  return {
    kind: 'number',
    value,
    prefix: normalizeCurrency(g.pre ?? ''),
    suffix,
    percent,
    scaled: Boolean(g.scale),
  }
}

function normalizeCurrency(symbol: string): string {
  if (!symbol) return ''
  if (/^(?:[¥￥]|RMB|CNY)$/i.test(symbol)) return '¥'
  if (/^(?:\$|USD|US\$)$/i.test(symbol)) return '$'
  if (/^EUR$/i.test(symbol)) return '€'
  return symbol
}

// ---- dates ----

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const CN_DIGITS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 }
/** Year used for periods given without one (`Q1`, `3月`), so they still sort. */
const NO_YEAR = 2000

function year4(text: string | undefined): number | undefined {
  if (!text) return undefined
  const n = Number(text)
  return text.length <= 2 ? 2000 + n : n
}

function cnNumber(text: string): number {
  return /^\d+$/.test(text) ? Number(text) : (CN_DIGITS[text] ?? NaN)
}

function utc(year: number, month = 1, day = 1, hour = 0, minute = 0): number {
  return Date.UTC(year, month - 1, day, hour, minute)
}

function validMonth(month: number) {
  return month >= 1 && month <= 12
}

type DateCell = Extract<Cell, { kind: 'date' }>

function date(year: number | undefined, month: number, day: number, grain: Grain, hour = 0, minute = 0): DateCell | null {
  if (!validMonth(month) || day < 1 || day > 31) return null
  return { kind: 'date', t: utc(year ?? NO_YEAR, month, day, hour, minute), grain, yearless: year === undefined }
}

/** Parses one date or period. Bare 4-digit years are left to the column (they may be plain numbers). */
export function parseDate(raw: string): DateCell | null {
  const text = raw.trim()
  let m: RegExpMatchArray | null

  // 2024-03-01, 2024/3/1, 2024.03.01, with optional time
  if ((m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/)))
    return date(+m[1], +m[2], +m[3], m[4] ? 'time' : 'day', m[4] ? +m[4] : 0, m[5] ? +m[5] : 0)
  // 2024-03, 2024/3, 2024.3
  if ((m = text.match(/^(\d{4})[-/.](\d{1,2})$/))) return date(+m[1], +m[2], 1, 'month')
  // 2024年3月(5日)
  if ((m = text.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月(?:\s*(\d{1,2})\s*[日号])?$/)))
    return date(+m[1], +m[2], m[3] ? +m[3] : 1, m[3] ? 'day' : 'month')
  // 2024年
  if ((m = text.match(/^(\d{4})\s*年(?:度)?$/))) return date(+m[1], 1, 1, 'year')
  // FY2024, FY24
  if ((m = text.match(/^FY\s*'?(\d{2}|\d{4})$/i))) return date(year4(m[1]), 1, 1, 'year')
  // 3月, 三月, 3月5日
  if ((m = text.match(/^([一二三四五六七八九十]{1,3}|\d{1,2})\s*月(?:份)?(?:\s*(\d{1,2})\s*[日号])?$/))) {
    const month = cnNumber(m[1])
    return date(undefined, month, m[2] ? +m[2] : 1, m[2] ? 'day' : 'month')
  }
  // 3/15/2024 (US) or 15/3/2024
  if ((m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) {
    const [a, b] = [+m[1], +m[2]]
    return a > 12 ? date(+m[3], b, a, 'day') : date(+m[3], a, b, 'day')
  }
  // Quarters: Q1, Q1 2024, Q1'24, 2024Q1, 2024-Q1, 2024年Q1, 2024年第一季度, 一季度
  if ((m = text.match(/^(?:(\d{4})\s*(?:年|-|\/|\s)?\s*)?Q([1-4])(?:\s*(?:'|-|\s|\/)?\s*(\d{2}|\d{4}))?$/i)))
    return date(year4(m[1] ?? m[3]), (+m[2] - 1) * 3 + 1, 1, 'quarter')
  if ((m = text.match(/^(?:(\d{4})\s*年?\s*)?第?([一二三四1-4])\s*季度?$/)) && /季/.test(text))
    return date(year4(m[1]), (cnNumber(m[2]) - 1) * 3 + 1, 1, 'quarter')
  // Jan, January, Jan 2024, Jan-24, Jan '24, 2024 Jan
  if ((m = text.match(/^([a-z]{3,9})\.?(?:[\s\-']+(\d{2}|\d{4}))?$/i))) {
    const month = monthIndex(m[1])
    if (month) return date(year4(m[2]), month, 1, 'month')
  }
  if ((m = text.match(/^(\d{4})[\s-]([a-z]{3,9})$/i))) {
    const month = monthIndex(m[2])
    if (month) return date(+m[1], month, 1, 'month')
  }
  // Weeks: 2024-W12, W12, 第12周
  if ((m = text.match(/^(?:(\d{4})-?)?W(\d{1,2})$/i)) || (m = text.match(/^(?:(\d{4})年?)?第\s*(\d{1,2})\s*周$/))) {
    const week = +m[2]
    if (week < 1 || week > 53) return null
    return { kind: 'date', t: utc(year4(m[1]) ?? NO_YEAR, 1, 1 + (week - 1) * 7), grain: 'week', yearless: !m[1] }
  }
  return null
}

function monthIndex(word: string): number {
  const key = word.slice(0, 3).toLowerCase()
  const index = MONTHS.indexOf(key)
  if (index < 0) return 0
  // Accept "Sept" and full names, reject words that merely start like a month ("Marketing").
  const full = new Date(Date.UTC(2000, index, 1)).toLocaleString('en', { month: 'long', timeZone: 'UTC' }).toLowerCase()
  const lower = word.toLowerCase()
  return lower.length === 3 || full.startsWith(lower) || lower === 'sept' ? index + 1 : 0
}

/** The first instant after a period, so a range "Jan – Mar" covers all of March. */
export function periodEnd(t: number, grain: Grain): number {
  const d = new Date(t)
  const [y, mo, day] = [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]
  switch (grain) {
    case 'year':
      return Date.UTC(y + 1, 0, 1)
    case 'quarter':
      return Date.UTC(y, mo + 3, 1)
    case 'month':
      return Date.UTC(y, mo + 1, 1)
    case 'week':
      return Date.UTC(y, mo, day + 7)
    case 'day':
      return Date.UTC(y, mo, day + 1)
    case 'time':
      return t
  }
}

const RANGE_SPLIT = /\s*(?:~|～|至|到|→|->|—|–|\s-\s|\sto\s|\s-|-\s)\s*/i

export function parseRange(raw: string): Extract<Cell, { kind: 'range' }> | null {
  const parts = raw.trim().split(RANGE_SPLIT)
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  const start = parseDate(parts[0]) ?? yearDate(parts[0])
  let end = parseDate(parts[1]) ?? yearDate(parts[1])
  // "3月1日 – 15日" / "2024-03-01 ~ 03-15": borrow what the end leaves out.
  if (start && !end) {
    const s = new Date(start.t)
    const short = parts[1].match(/^(?:(\d{1,2})[-/.月])?(\d{1,2})[日号]?$/)
    if (short && start.grain === 'day') {
      end = date(start.yearless ? undefined : s.getUTCFullYear(), short[1] ? +short[1] : s.getUTCMonth() + 1, +short[2], 'day')
    }
  }
  if (!start || !end) return null
  if (end.yearless && !start.yearless) {
    const e = new Date(end.t)
    end = { ...end, yearless: false, t: Date.UTC(new Date(start.t).getUTCFullYear(), e.getUTCMonth(), e.getUTCDate()) }
  }
  const endT = periodEnd(end.t, end.grain)
  if (endT < start.t) return null
  return { kind: 'range', start: start.t, end: endT, grain: start.grain }
}

function yearDate(text: string): DateCell | null {
  const m = text.trim().match(/^(\d{4})$/)
  return m && +m[1] >= 1900 && +m[1] <= 2100 ? date(+m[1], 1, 1, 'year') : null
}

/** Reads a cell as the most specific kind it can be. */
export function parseCell(raw: string): Cell {
  const text = raw.trim()
  if (isMissing(text)) return { kind: 'missing' }
  const asDate = parseDate(text)
  if (asDate) return asDate
  const asNumber = parseNumber(text)
  if (asNumber) return asNumber
  const asRange = parseRange(text)
  if (asRange) return asRange
  return { kind: 'text', text }
}
