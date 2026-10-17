/**
 * Finds the table in pasted text: tab-separated rows copied from Excel or
 * Google Sheets, CSV, Markdown tables (with the notes an AI writes around
 * them), and the bordered output of database clients. A SQL query pasted
 * alongside the result is split off so it can be used as a hint.
 */

export type SourceFormat = 'markdown' | 'tsv' | 'csv' | 'aligned'

export interface Grid {
  format: SourceFormat
  header: string[]
  rows: string[][]
  /** The SQL query found next to the table, if any. */
  sql?: string
  /** Lines before/after the table that were ignored (AI notes, titles, row counts). */
  ignoredLines: number
}

const SQL_START = /^\s*(?:select|with)\b/i
const CLIENT_PROMPT = /^\s*(?:mysql>|->|\w*=[>#]|sqlite>|presto>|trino>|bq>)\s?/i

/** Separates a SQL query from the rest of the paste. */
export function splitSql(text: string): { sql?: string; rest: string } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const fence = lines.findIndex((line) => /^\s*```\s*sql\b/i.test(line))
  if (fence >= 0) {
    const close = lines.findIndex((line, i) => i > fence && /^\s*```\s*$/.test(line))
    const end = close < 0 ? lines.length : close
    return {
      sql: lines.slice(fence + 1, end).join('\n').trim(),
      rest: [...lines.slice(0, fence), ...lines.slice(end + 1)].join('\n'),
    }
  }
  const start = lines.findIndex((line) => SQL_START.test(line.replace(CLIENT_PROMPT, '')))
  if (start < 0) return { rest: text }
  let end = start
  while (end < lines.length) {
    const line = lines[end].replace(CLIENT_PROMPT, '')
    if (end > start && !line.trim()) break
    // Result rows begin where the query ends.
    if (end > start && /^\s*[|+]/.test(lines[end])) break
    end++
    if (/;\s*$/.test(line)) break
  }
  const sql = lines
    .slice(start, end)
    .map((line) => line.replace(CLIENT_PROMPT, ''))
    .join('\n')
    .trim()
  return { sql, rest: [...lines.slice(0, start), ...lines.slice(end)].join('\n') }
}

export function extractGrid(input: string): Grid | null {
  const { sql, rest } = splitSql(input)
  const text = rest
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => !/^\s*```/.test(line))
    .join('\n')

  const grid = pipeGrid(text) ?? delimitedGrid(text, '\t', 'tsv') ?? csvGrid(text) ?? alignedGrid(text)
  if (!grid) return null
  return { ...grid, sql }
}

// ---- Markdown and database-client tables ----

const PIPE_ROW = /^\s*\|?.*\|.*\|?\s*$/
const PIPE_RULE = /^\s*[|+]?\s*:?[-=]{2,}:?\s*(?:[|+]\s*:?[-=]{2,}:?\s*)*[|+]?\s*$/

function pipeGrid(text: string): Omit<Grid, 'sql'> | null {
  const lines = text.split('\n')
  // The longest run of lines that are table rows or rules.
  let best: [number, number] | null = null
  for (let i = 0; i < lines.length; ) {
    if (!isPipeLine(lines[i])) {
      i++
      continue
    }
    let j = i
    while (j < lines.length && isPipeLine(lines[j])) j++
    const rows = lines.slice(i, j).filter((line) => !PIPE_RULE.test(line))
    const hasRule = lines.slice(i, j).some((line) => PIPE_RULE.test(line))
    if (rows.length >= 2 && hasRule && (!best || j - i > best[1] - best[0])) best = [i, j]
    i = j
  }
  if (!best) return null
  const block = lines.slice(best[0], best[1]).filter((line) => !PIPE_RULE.test(line))
  const cells = block.map(splitPipeRow)
  const width = Math.max(...cells.map((row) => row.length))
  const rows = cells.map((row) => pad(row, width).map(cleanMarkdown))
  const ignored = lines.filter((line, i) => (i < best[0] || i >= best[1]) && line.trim()).length
  return finish('markdown', rows, ignored)
}

function isPipeLine(line: string): boolean {
  return PIPE_RULE.test(line) || (PIPE_ROW.test(line) && (line.match(/(?<!\\)\|/g)?.length ?? 0) >= 1 && line.trim().length > 1)
}

function splitPipeRow(line: string): string[] {
  let body = line.trim()
  if (body.startsWith('|')) body = body.slice(1)
  if (body.endsWith('|') && !body.endsWith('\\|')) body = body.slice(0, -1)
  return body.split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, '|').trim())
}

function cleanMarkdown(cell: string): string {
  return cell
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, '$1$2')
    .replace(/(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim()
}

// ---- delimited text ----

/** Splits delimited text into records, honouring double quotes (cells with the delimiter or line breaks). */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const records: string[][] = []
  let record: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true
      cell = ''
    } else if (ch === delimiter) {
      record.push(cell)
      cell = ''
    } else if (ch === '\n') {
      record.push(cell)
      records.push(record)
      record = []
      cell = ''
    } else cell += ch
  }
  record.push(cell)
  records.push(record)
  return records.map((r) => r.map((c) => c.trim()))
}

function delimitedGrid(text: string, delimiter: string, format: SourceFormat): Omit<Grid, 'sql'> | null {
  if (!text.includes(delimiter)) return null
  const records = parseDelimited(text, delimiter)
  // The longest run of records with at least two cells; notes and blank lines end it.
  let best: [number, number] | null = null
  for (let i = 0; i < records.length; ) {
    if (records[i].length < 2) {
      i++
      continue
    }
    let j = i
    while (j < records.length && records[j].length >= 2) j++
    if (!best || j - i > best[1] - best[0]) best = [i, j]
    i = j
  }
  if (!best || best[1] - best[0] < 2) return null
  const block = records.slice(best[0], best[1])
  const ignored = records.filter((record, i) => (i < best[0] || i >= best[1]) && record.some(Boolean)).length
  return finish(format, block, ignored)
}

function csvGrid(text: string): Omit<Grid, 'sql'> | null {
  // Pick the delimiter whose rows agree on a column count most often.
  let best: Omit<Grid, 'sql'> | null = null
  let bestScore = 0
  for (const delimiter of [',', ';', '，']) {
    const grid = delimitedGrid(text, delimiter, 'csv')
    if (!grid) continue
    const width = grid.header.length
    const score = grid.rows.filter((row) => row.filter(Boolean).length > 1).length * Math.min(width, 6)
    if (score > bestScore) [best, bestScore] = [grid, score]
  }
  return best
}

/** Columns lined up with runs of spaces (plain-text console output). */
function alignedGrid(text: string): Omit<Grid, 'sql'> | null {
  const records = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^[-=+\s]+$/.test(line))
    .map((line) => line.split(/\s{2,}/))
  const width = records[0]?.length ?? 0
  if (width < 2 || records.length < 3 || records.some((r) => r.length !== width)) return null
  return finish('aligned', records, 0)
}

// ---- tidy-up shared by every format ----

const ROW_COUNT = /^\(?\d+\s+rows?(?:\s+in\s+set.*)?\)?$|^\d+\s+rows? selected/i

function finish(format: SourceFormat, records: string[][], ignoredLines: number): Omit<Grid, 'sql'> | null {
  let rows = records.filter((row) => row.some((cell) => cell !== '') && !ROW_COUNT.test(row.join(' ').trim()))
  let width = Math.max(0, ...rows.map((row) => row.length))
  rows = rows.map((row) => pad(row, width))
  // Drop columns that are empty all the way down (Excel copies often carry a few).
  const keep = Array.from({ length: width }, (_, c) => rows.some((row) => row[c] !== ''))
  rows = rows.map((row) => row.filter((_, c) => keep[c]))
  width = rows[0]?.length ?? 0
  // A title row above the table: one filled cell in a wider table.
  while (rows.length > 2 && width >= 3 && rows[0].filter(Boolean).length <= 1) {
    rows.shift()
    ignoredLines++
  }
  if (width < 2 || rows.length < 2) return null
  const [header, ...body] = rows
  return { format, header: header.map((cell, i) => cell || (i === 0 ? '' : `#${i + 1}`)), rows: body, ignoredLines }
}

function pad(row: string[], width: number): string[] {
  return row.length >= width ? row.slice(0, width) : [...row, ...Array<string>(width - row.length).fill('')]
}
