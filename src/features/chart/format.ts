/**
 * Number and date labels: 万 and 亿 in Chinese, K, M and B in English,
 * percentages as %, currency in front and unit words behind.
 */
import type { Unit } from './table'
import type { Grain } from './values'

export type ChartLanguage = 'zh-CN' | 'en'

const STEPS: Record<ChartLanguage, [number, string][]> = {
  'zh-CN': [
    [1e12, '万亿'],
    [1e8, '亿'],
    [1e4, '万'],
  ],
  en: [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ],
}

function trim(value: number, digits: number): string {
  return value.toFixed(digits).replace(/\.0+$|(\.\d*?)0+$/, '$1')
}

/** A short number: 3.25万, 1.2亿, 12.5K, 1.8M. */
export function compactNumber(value: number, lang: ChartLanguage): string {
  const abs = Math.abs(value)
  for (const [size, word] of STEPS[lang]) {
    if (abs >= size) {
      const scaled = value / size
      const a = Math.abs(scaled)
      return trim(scaled, a < 10 ? 2 : a < 100 ? 1 : 0) + word
    }
  }
  if (abs === 0) return '0'
  return trim(value, abs < 1 ? 3 : abs < 10 ? 2 : abs < 100 ? 1 : 0)
}

/** A full number with digit grouping: 12,345,678.9. */
export function fullNumber(value: number, lang: ChartLanguage): string {
  return new Intl.NumberFormat(lang, { maximumFractionDigits: Math.abs(value) < 10 ? 2 : 1 }).format(value)
}

/** A value with its unit, for axis ticks and tooltips; `full` writes every digit instead of 万/K. */
export function formatValue(value: number | null | undefined, unit: Unit, lang: ChartLanguage, full = false): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '–'
  if (unit.percent) return trim(value * 100, Math.abs(value) < 0.1 ? 2 : 1) + '%'
  const sign = value < 0 ? '-' : ''
  const body = full ? fullNumber(Math.abs(value), lang) : compactNumber(Math.abs(value), lang)
  // Chinese: 3.2万元 · English: $1.2M, 12 kg
  const suffix = unit.suffix ? (lang === 'en' && /^[a-z]/i.test(unit.suffix) ? ' ' : '') + unit.suffix : ''
  return sign + unit.prefix + body + suffix
}

/** Axis ticks leave the unit word to the axis name. */
export function formatTick(value: number, unit: Unit, lang: ChartLanguage, full = false): string {
  return formatValue(value, { ...unit, suffix: '' }, lang, full)
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatDate(t: number, grain: Grain | undefined, lang: ChartLanguage, yearless = false): string {
  const d = new Date(t)
  const [y, m, day] = [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]
  const zh = lang === 'zh-CN'
  switch (grain) {
    case 'year':
      return zh ? `${y}年` : String(y)
    case 'quarter': {
      const q = `Q${Math.floor(m / 3) + 1}`
      return yearless ? q : zh ? `${y}年${q}` : `${q} ${y}`
    }
    case 'month':
      return yearless ? (zh ? `${m + 1}月` : MONTHS_EN[m]) : zh ? `${y}年${m + 1}月` : `${MONTHS_EN[m]} ${y}`
    case 'week': {
      const week = Math.floor((Date.UTC(y, m, day) - Date.UTC(y, 0, 1)) / (7 * 864e5)) + 1
      return yearless ? `W${week}` : zh ? `${y}年第${week}周` : `${y} W${week}`
    }
    case 'time':
      return d.toISOString().slice(0, 16).replace('T', ' ')
    default:
      return yearless ? (zh ? `${m + 1}月${day}日` : `${MONTHS_EN[m]} ${day}`) : zh ? `${y}年${m + 1}月${day}日` : `${MONTHS_EN[m]} ${day}, ${y}`
  }
}

/** Every period from the first to the last, so a missing month shows as a gap instead of vanishing. */
export function fillPeriods(times: number[], grain: Grain | undefined): number[] {
  if (!times.length || !grain || grain === 'time') return times
  const sorted = [...new Set(times)].sort((a, b) => a - b)
  const step = (t: number): number => {
    const d = new Date(t)
    const [y, m, day] = [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]
    switch (grain) {
      case 'year':
        return Date.UTC(y + 1, m, 1)
      case 'quarter':
        return Date.UTC(y, m + 3, 1)
      case 'month':
        return Date.UTC(y, m + 1, 1)
      case 'week':
        return Date.UTC(y, m, day + 7)
      default:
        return Date.UTC(y, m, day + 1)
    }
  }
  const out: number[] = []
  const last = sorted[sorted.length - 1]
  for (let t = sorted[0]; t <= last && out.length < 2000; t = step(t)) out.push(t)
  // Periods that don't fall on the stepped grid (e.g. mid-month days) are kept as given.
  return out.length < 2000 && sorted.every((t) => out.includes(t)) ? out : sorted
}
