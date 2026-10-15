import { escapeHtml } from '../mindmap/sanitize'
import type { MindDocument } from '../mindmap/types'

/** Id of the script element that carries the map inside an exported HTML file. */
export const HTML_DATA_ID = 'wen2tu-data'

export interface ViewerAssets {
  script: string
  css: string
}

/**
 * Embeds JSON in an HTML <script> element. "<" is escaped so topic text can
 * never close the element (</script>) or open a comment; U+2028/2029 are
 * escaped for older JavaScript parsers.
 */
export function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/** Inline code must not contain the closing tag of the element it lives in. */
function inlineSafe(code: string, tag: 'script' | 'style'): string {
  return code.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`)
}

/**
 * A single, self-contained HTML file: the map data, the read-only viewer and
 * its styles inline. It opens offline in any browser and loads nothing from
 * the network.
 */
export function buildHtml({
  doc,
  title,
  language,
  assets,
  homepage,
}: {
  doc: MindDocument
  title: string
  language: string
  assets: ViewerAssets
  homepage: string
}): string {
  return `<!doctype html>
<html lang="${escapeHtml(language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="wen2tu">
<title>${escapeHtml(title)}</title>
<style>${inlineSafe(assets.css, 'style')}</style>
</head>
<body>
<div id="map" class="canvas"></div>
<a class="wen2tu-badge" href="${escapeHtml(homepage)}" target="_blank" rel="noopener noreferrer">文兔兔 · wen2tu</a>
<script type="application/json" id="${HTML_DATA_ID}">${embedJson(doc)}</script>
<script>${inlineSafe(assets.script, 'script')}</script>
</body>
</html>
`
}

/** The map data stored in an exported HTML file, or null if there is none. */
export function extractHtmlData(html: string): string | null {
  const match = html.match(
    new RegExp(`<script[^>]*\\bid=["']${HTML_DATA_ID}["'][^>]*>([\\s\\S]*?)</script>`, 'i'),
  )
  return match ? match[1] : null
}
