/*
 * Read-only viewer embedded in exported HTML files. It renders the map stored
 * in <script type="application/json" id="wen2tu-data"> with the same look as
 * the editor: pan, zoom, expand/collapse and clickable links, no editing.
 * Built separately (vite.viewer.config.ts) and inlined by the HTML exporter.
 */
import MindElixir, { type MindElixirData } from 'mind-elixir'
import 'mind-elixir/style.css'
import { systemTheme } from '../features/appearance/themes'
import { escapeHtml } from '../features/mindmap/sanitize'
import type { MindDocument } from '../features/mindmap/types'
import { fitToScreen, installMapRendering } from '../features/rendering/mapRendering'
import './viewer.css'

const data = document.getElementById('wen2tu-data')?.textContent
const element = document.getElementById('map')

if (data && element) {
  const { map } = JSON.parse(data) as MindDocument
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const themeFor = () => map.theme ?? systemTheme(darkQuery.matches)

  const mind = new MindElixir({
    el: element,
    direction: map.direction ?? MindElixir.SIDE,
    editable: false,
    toolBar: true,
    keypress: false,
    contextMenu: false,
    allowUndo: false,
    // Topic text is plain text, never HTML.
    markdown: (text) => escapeHtml(text),
  })
  const rendering = installMapRendering(mind, () => map.shape)
  rendering.applyTheme(themeFor(), false)
  // The theme is already applied (with wen2tu's branch drawing); don't let
  // init replace it with the plain one stored in the file.
  mind.init({ ...map, theme: undefined } as unknown as MindElixirData)
  fitToScreen(mind)

  darkQuery.addEventListener('change', () => {
    if (!map.theme) rendering.applyTheme(themeFor(), true)
  })
}
