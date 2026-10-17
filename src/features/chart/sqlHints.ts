/**
 * Reads the parts of a SQL query that say how its result should be charted:
 * which output columns are groups (GROUP BY), which are aggregates and of what
 * kind (sum/count/avg…, named by AS), and how the rows were ordered.
 */

export type Aggregate = 'sum' | 'count' | 'avg' | 'min' | 'max'

export interface SqlHints {
  /** Output column names, in SELECT order, lower-cased. */
  outputs: string[]
  /** Output columns the query grouped by. */
  groupBy: string[]
  aggregates: Record<string, Aggregate>
  /** Output columns computed from a date (DATE_TRUNC, TO_CHAR…), or a part of one (EXTRACT(HOUR …)). */
  timeParts: Record<string, 'date' | 'part'>
  orderBy: { name: string; desc: boolean }[]
  limit?: number
}

const AGGREGATE = /\b(sum|count|avg|average|mean|min|max)\s*\(/i
const DATE_FN = /\b(date_trunc|trunc|to_char|date_format|strftime|format_date|format_timestamp|date|toStartOf\w+|timestamp_trunc|datetrunc)\s*\(/i
const DATE_PART = /\b(extract|date_part|datepart|hour|dayofweek|weekday|dow|month|year|quarter|week)\s*\(/i

/** Removes comments and string contents, and records parenthesis depth per character. */
function scan(sql: string): { text: string; depth: number[] } {
  const clean = sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
  const depth: number[] = []
  let d = 0
  for (const ch of clean) {
    if (ch === '(') d++
    depth.push(d)
    if (ch === ')') d = Math.max(0, d - 1)
  }
  return { text: clean, depth }
}

/** Finds a keyword at parenthesis depth 0, at or after `from`. */
function findTop(text: string, depth: number[], keyword: RegExp, from = 0): number {
  const re = new RegExp(keyword.source, 'gi')
  re.lastIndex = from
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) if (depth[m.index] === 0) return m.index
  return -1
}

function splitTop(text: string): string[] {
  const parts: string[] = []
  let d = 0
  let quote = ''
  let current = ''
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = ''
    } else if (ch === "'" || ch === '"' || ch === '`') quote = ch
    else if (ch === '(') d++
    else if (ch === ')') d--
    else if (ch === ',' && d === 0) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function unquote(name: string): string {
  return name.replace(/^[`"[']|[`"\]']$/g, '').toLowerCase()
}

function outputName(item: string): { name: string; expr: string } {
  const as = item.match(/^(.*?)\s+as\s+([`"[']?[\p{L}\w\s]+?[`"\]']?)\s*$/isu)
  if (as) return { expr: as[1].trim(), name: unquote(as[2].trim()) }
  const trailing = item.match(/^(.*[)\s])\s*([`"]?[\p{L}_][\p{L}\w]*[`"]?)$/su)
  if (trailing && /[()]/.test(trailing[1])) return { expr: trailing[1].trim(), name: unquote(trailing[2]) }
  const column = item.split('.').pop() ?? item
  return { expr: item, name: unquote(column.trim()) }
}

export function parseSqlHints(sql: string): SqlHints | null {
  const { text, depth } = scan(sql)
  // The outer SELECT: the last one at depth 0 (after any WITH … AS (…) blocks).
  let select = -1
  for (let at = findTop(text, depth, /\bselect\b/); at >= 0; at = findTop(text, depth, /\bselect\b/, at + 6)) select = at
  if (select < 0) return null
  const from = findTop(text, depth, /\bfrom\b/, select)
  const list = text.slice(select + 6, from < 0 ? undefined : from).replace(/^\s*(?:distinct|top\s+\d+)\s+/i, '')
  const items = splitTop(list).map(outputName)
  const outputs = items.map((item) => item.name)

  const aggregates: Record<string, Aggregate> = {}
  const timeParts: SqlHints['timeParts'] = {}
  for (const item of items) {
    const agg = item.expr.match(AGGREGATE)
    if (agg) {
      const fn = agg[1].toLowerCase()
      aggregates[item.name] = fn === 'average' || fn === 'mean' ? 'avg' : (fn as Aggregate)
    } else if (DATE_PART.test(item.expr) && !/date_trunc/i.test(item.expr)) timeParts[item.name] = 'part'
    else if (DATE_FN.test(item.expr)) timeParts[item.name] = 'date'
  }

  const resolve = (ref: string): string => {
    const trimmed = ref.trim()
    if (/^\d+$/.test(trimmed)) return outputs[Number(trimmed) - 1] ?? trimmed
    const byExpr = items.find((item) => item.expr.replace(/\s+/g, '').toLowerCase() === trimmed.replace(/\s+/g, '').toLowerCase())
    if (byExpr) return byExpr.name
    return unquote(trimmed.split('.').pop() ?? trimmed)
  }

  const clause = (keyword: RegExp, enders: RegExp): string | null => {
    const at = findTop(text, depth, keyword, select)
    if (at < 0) return null
    const start = at + (text.slice(at).match(new RegExp(keyword.source, 'i'))?.[0].length ?? 0)
    const end = findTop(text, depth, enders, start)
    return text.slice(start, end < 0 ? undefined : end).replace(/;\s*$/, '')
  }

  const group = clause(/\bgroup\s+by\b/, /\b(?:having|order\s+by|limit|window|qualify|union)\b|;/)
  const order = clause(/\border\s+by\b/, /\b(?:limit|offset|fetch|union)\b|;/)
  const limit = clause(/\blimit\b/, /\boffset\b|;/)

  return {
    outputs,
    groupBy: group ? splitTop(group).map(resolve) : [],
    aggregates,
    timeParts,
    orderBy: order
      ? splitTop(order).map((part) => {
          const m = part.match(/^(.*?)(?:\s+(asc|desc))?(?:\s+nulls\s+(?:first|last))?\s*$/i)!
          return { name: resolve(m[1]), desc: m[2]?.toLowerCase() === 'desc' }
        })
      : [],
    limit: limit && /^\s*\d+/.test(limit) ? Number(limit.trim().match(/^\d+/)![0]) : undefined,
  }
}
