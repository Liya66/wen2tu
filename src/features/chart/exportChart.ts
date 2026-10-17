/**
 * Chart exports: SVG and PNG images (with the card background, or
 * transparent), the PNG copied to the clipboard, and the detected data as
 * CSV. Images are drawn off screen by ECharts' server-side SVG renderer, so
 * an export never depends on the size or state of the chart on the page.
 */
import { buildChart, columnLabel, type BuildContext } from './buildOption'
import type { Recommendation } from './recommend'
import { chartColumns, type Column, type Table } from './table'
import { LIGHT, THEME_NAME } from './theme'

export type ImageFormat = 'png' | 'svg'

const PADDING = 20
/** PNGs are drawn at twice the size so they stay sharp on high-density screens and in documents. */
const PNG_SCALE = 2

export interface ChartImage {
  svg: string
  width: number
  height: number
}

/**
 * Draws the chart as an SVG document. A transparent image uses the light
 * colours whatever the page's theme, so it reads on the white pages most
 * images end up on.
 */
export async function renderChartSvg(rec: Recommendation, table: Table, ctx: BuildContext, transparent: boolean): Promise<ChartImage> {
  const { init } = await import('./echarts')
  const colors = transparent ? LIGHT : ctx.colors
  const built = buildChart(rec, table, { ...ctx, colors })
  const chart = init(null, THEME_NAME[colors.mode], { renderer: 'svg', ssr: true, width: ctx.width, height: built.height })
  try {
    chart.setOption({ ...built.option, animation: false, backgroundColor: 'transparent' })
    const inner = chart.renderToSVGString()
    const width = ctx.width + PADDING * 2
    const height = built.height + PADDING * 2
    const background = transparent ? '' : `<rect width="100%" height="100%" fill="${colors.surface}"/>`
    // The chart's own <svg>, nested and offset to leave a margin around it.
    const nested = inner.replace(/^<svg\b/, `<svg x="${PADDING}" y="${PADDING}"`)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${background}${nested}</svg>`
    return { svg, width, height }
  } finally {
    chart.dispose()
  }
}

/** Rasterizes an SVG document to a PNG. */
export async function svgToPng({ svg, width, height }: ChartImage): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * PNG_SCALE)
    canvas.height = Math.round(height * PNG_SCALE)
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png'),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function chartImageBlob(rec: Recommendation, table: Table, ctx: BuildContext, format: ImageFormat, transparent: boolean): Promise<Blob> {
  const image = await renderChartSvg(rec, table, ctx, transparent)
  return format === 'svg' ? new Blob([image.svg], { type: 'image/svg+xml' }) : svgToPng(image)
}

/** Puts the chart on the clipboard as a PNG, for pasting into documents and chats. */
export async function copyChartImage(rec: Recommendation, table: Table, ctx: BuildContext): Promise<void> {
  // The promise is handed to the clipboard right away, inside the click, as Safari requires.
  const png = chartImageBlob(rec, table, ctx, 'png', false)
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
}

// ---- data ----

function isoDate(t: number, col: Column): string {
  const d = new Date(t)
  const [y, m, day] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]
  const two = (n: number) => String(n).padStart(2, '0')
  switch (col.grain) {
    case 'year':
      return String(y)
    case 'quarter':
      return `${y}-Q${Math.floor((m - 1) / 3) + 1}`
    case 'month':
      return `${y}-${two(m)}`
    case 'time':
      return d.toISOString().slice(0, 16).replace('T', ' ')
    default:
      return `${y}-${two(m)}-${two(day)}`
  }
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/**
 * The detected data as CSV (long form for unpivoted tables): plain numbers
 * without 万/K, percentages with %, dates as ISO text. Starts with a BOM so
 * Excel reads Chinese text correctly.
 */
export function tableToCsv(table: Table, labels: Parameters<typeof columnLabel>[1]): string {
  const { columns, rowCount } = chartColumns(table)
  const cell = (col: Column, row: number): string => {
    switch (col.type) {
      case 'number': {
        const v = col.values[row]
        if (v === null) return ''
        return col.unit.percent ? `${+(v * 100).toPrecision(12)}%` : String(+v.toPrecision(15))
      }
      case 'date':
        // Periods without a year (Q1, 3月) have no ISO form: keep them as written.
        return col.values[row] === null ? '' : col.yearless ? col.text[row] : isoDate(col.values[row]!, col)
      case 'range': {
        const range = col.ranges[row]
        return range ? `${isoDate(range[0], { ...col, grain: 'day' })}/${isoDate(range[1] - 864e5, { ...col, grain: 'day' })}` : ''
      }
      default:
        return col.text[row] ?? ''
    }
  }
  const lines = [columns.map((col) => csvCell(columnLabel(col, labels))).join(',')]
  for (let row = 0; row < rowCount; row++) lines.push(columns.map((col) => csvCell(cell(col, row))).join(','))
  return '﻿' + lines.join('\r\n') + '\r\n'
}

/** A file name from the chart's title: characters invalid on Windows/macOS become "_". */
export function exportFileName(title: string, extension: string): string {
  // oxlint-disable-next-line no-control-regex
  const base = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 80) || 'chart'
  return `${base}.${extension}`
}
