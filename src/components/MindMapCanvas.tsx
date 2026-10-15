import MindElixir, {
  type MindElixirData,
  type MindElixirInstance,
  type NodeObj,
  type Operation,
  type Topic,
} from 'mind-elixir'
import { en as engineEn, zh_CN as engineZh, type LangPack } from 'mind-elixir/i18n'
import 'mind-elixir/style.css'
import { useEffect, useRef } from 'react'
import type { Language } from '../i18n'
import { shortcut } from '../utils/platform'
import { parseOutline } from '../features/import-export/outlineText'
import {
  fitToScreen,
  installMapRendering,
  toEngineTheme,
  type MapShape,
} from '../features/rendering/mapRendering'
import { fromEngineData } from '../features/mindmap/document'
import { sanitizeNodeTree } from '../features/mindmap/schema'
import { escapeHtml } from '../features/mindmap/sanitize'
import type { StylePatch } from '../features/appearance/nodeStyles'
import { lightVariantOf, systemTheme } from '../features/appearance/themes'
import type { Direction, MapNode, MapTheme, MindMap, ThemeVar } from '../features/mindmap/types'
import type { CanvasAdapter } from '../features/workspace/workspaceController'

const ENGINE_LOCALES: Record<Language, LangPack> = {
  en: engineEn,
  // House wording: “上级节点”, not “父节点”.
  'zh-CN': { ...engineZh, addParent: '插入上级节点' },
}

/** Context menu item ids rendered by Mind Elixir, and the locale key for each. */
const MENU_ITEMS: Array<[string, keyof LangPack]> = [
  ['cm-add_child', 'addChild'],
  ['cm-add_parent', 'addParent'],
  ['cm-add_sibling', 'addSibling'],
  ['cm-remove_child', 'removeNode'],
  ['cm-fucus', 'focus'],
  ['cm-unfucus', 'cancelFocus'],
  ['cm-up', 'moveUp'],
  ['cm-down', 'moveDown'],
  ['cm-link', 'link'],
  ['cm-link-bidirectional', 'linkBidirectional'],
  ['cm-summary', 'summary'],
]

/**
 * Mind Elixir builds its context menu once at init. Rebuilding the editor to
 * change language would lose undo history, so the existing menu is relabelled
 * in place. The locale object itself is shared with the engine (it reads
 * `clickTips` from it lazily), so it is mutated rather than replaced.
 */
function applyEngineLocale(mind: MindElixirInstance, locale: LangPack, language: Language) {
  Object.assign(locale, ENGINE_LOCALES[language])
  for (const [id, key] of MENU_ITEMS) {
    const label = mind.container.querySelector(`#${id} span`)
    if (label) label.textContent = locale[key]
  }
}

export type { MapShape }

/** A selected topic, as the style panel sees it. */
export interface SelectedNode {
  id: string
  /** 0 = root, 1 = main branch, 2+ = deeper topics. */
  depth: number
  style: MapNode['style']
  branchColor?: string
  /** Color of the branch line leading to this topic (undefined for the root). */
  lineColor?: string
}

/** Appearance controls used by the style panel, on top of what the workspace needs. */
export interface EditorApi extends CanvasAdapter {
  /** The theme saved in the map, or undefined when it follows the system. */
  getTheme(): MapTheme | undefined
  /** The theme currently on screen. */
  effectiveTheme(): MapTheme
  setTheme(theme: MapTheme | undefined): void
  /** Shows a theme color without committing it (e.g. while dragging a color picker). */
  previewThemeVar(cssVar: ThemeVar, value: string): void
  /** Map-wide topic shape; undefined uses the color scheme's corners. */
  getShape(): MapShape | undefined
  setShape(shape: MapShape | undefined): void
  getDirection(): Direction
  setDirection(direction: Direction): void
  isCompact(): boolean
  setCompact(compact: boolean): void
  selection(): SelectedNode[]
  /** Shows a style on the selected topics without re-layout or an undo step. */
  previewNodeStyle(makePatch: (node: SelectedNode) => StylePatch): void
  /** Applies a style to every selected topic as a single undo step. */
  applyNodeStyle(makePatch: (node: SelectedNode) => StylePatch): void
  setBranchColor(color: string | undefined): void
  /** Parses an outline and adds it under the selected topic; false if nothing is selected. */
  pasteOutline(text: string): Promise<boolean>
}

/** Id of the “Paste outline” item added to the engine's context menu. */
const PASTE_MENU_ID = 'wen2tu-paste-outline'

/** Marker Mind Elixir puts in copied topics' clipboard JSON. */
const ENGINE_CLIPBOARD_MAGIC = 'MIND-ELIXIR-WAIT-COPY'

function depthOf(node: NodeObj): number {
  let depth = 0
  for (let current = node.parent; current; current = current.parent) depth++
  return depth
}

interface Props {
  language: Language
  label: string
  newTopicName: string
  onReady: (adapter: EditorApi | null) => void
  onChange: () => void
  onSelectionChange?: (nodes: SelectedNode[]) => void
  /** Problems that happen inside the editor, e.g. a paste that can't be read. */
  onError?: (error: unknown) => void
  /** Label of the “Paste outline” item in the topic context menu. */
  pasteLabel: string
  /** The user chose “Paste outline” in the topic context menu. */
  onPasteRequest?: () => void
}

export function MindMapCanvas({
  language,
  label,
  newTopicName,
  onReady,
  onChange,
  onSelectionChange,
  onError,
  pasteLabel,
  onPasteRequest,
}: Props) {
  const elementRef = useRef<HTMLDivElement>(null)
  const mindRef = useRef<MindElixirInstance | null>(null)
  const localeRef = useRef<LangPack>({ ...ENGINE_LOCALES[language] })
  const callbacks = useRef({ onReady, onChange, onSelectionChange, onError, onPasteRequest })

  useEffect(() => {
    callbacks.current = { onReady, onChange, onSelectionChange, onError, onPasteRequest }
  })

  useEffect(() => {
    const element = elementRef.current
    if (!element) return
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
    /** The theme stored in the current map; undefined = follow the system. */
    let savedTheme: MapTheme | undefined
    /** The map-wide topic shape; undefined = the color scheme's own corners. */
    let savedShape: MapShape | undefined

    const mind = new MindElixir({
      el: element,
      direction: MindElixir.SIDE,
      editable: true,
      toolBar: true,
      keypress: true,
      allowUndo: true,
      newTopicName,
      contextMenu: {
        locale: localeRef.current,
        focus: true,
        link: true,
        // The engine uses `name` as the item's id; the visible label is set
        // (and translated) by the language effect below.
        extend: [
          {
            name: PASTE_MENU_ID,
            key: shortcut('V'),
            onclick: () => {
              mind.container.querySelector<HTMLElement>('.context-menu')?.setAttribute('hidden', '')
              callbacks.current.onPasteRequest?.()
            },
          },
        ],
      },
      // Without a markdown function, arrow and summary labels are inserted
      // as raw HTML. Escaping everything keeps user text as plain text.
      markdown: (text) => escapeHtml(text),
      theme: toEngineTheme(systemTheme(darkQuery.matches)),
    })
    mind.init(MindElixir.new(''))
    mindRef.current = mind

    // wen2tu's branch lines, shapes and borders (shared with exported HTML).
    const rendering = installMapRendering(mind, () => savedShape)

    const notify = () => callbacks.current.onChange()

    const selection = (): SelectedNode[] =>
      (mind.currentNodes ?? []).map((tpc) => ({
        id: tpc.nodeObj.id,
        depth: depthOf(tpc.nodeObj),
        style: { ...(tpc.nodeObj.style as MapNode['style']) },
        branchColor: tpc.nodeObj.branchColor,
        lineColor: lineColorOf(tpc.nodeObj),
      }))
    // Selection events can arrive in bursts (e.g. undo re-selects); report once.
    let selectionQueued = false
    const reportSelection = () => {
      if (selectionQueued) return
      selectionQueued = true
      queueMicrotask(() => {
        selectionQueued = false
        if (mindRef.current === mind) callbacks.current.onSelectionChange?.(selection())
      })
    }

    // Undo and redo re-render from snapshots without emitting an operation.
    const engineUndo = mind.undo
    const engineRedo = mind.redo
    mind.undo = () => {
      engineUndo.call(mind)
      notify()
      reportSelection()
    }
    mind.redo = () => {
      engineRedo.call(mind)
      notify()
      reportSelection()
    }
    const onOperation = (operation: Operation) => {
      if (operation.name !== 'beginEdit') notify()
      reportSelection()
    }

    /** Inserts topics (with their subtopics) under the selected topic as one undo step. */
    const insertUnderSelection = (nodes: MapNode[]) => {
      const target = mind.currentNode
      if (!target || !nodes.length) return false
      if (target.nodeObj.expanded === false) mind.expandNode(target, true)
      // copyNodes clones the topics with fresh ids and fires a single operation.
      mind.copyNodes(nodes.map((nodeObj) => ({ nodeObj }) as unknown as Topic), target)
      return true
    }

    // Paste: runs before the engine's own handler (capture phase on an ancestor).
    // - The engine's node clipboard format is sanitized like a file before use,
    //   since any web page can put that JSON on the clipboard.
    // - Text outlines become subtopics of the selected topic.
    // - With nothing selected, the event is left for the app (new map).
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.id === 'input-box' || target?.isContentEditable) return
      const text = event.clipboardData?.getData('text/plain')
      if (!text) return
      let engineClipboard: unknown
      try {
        const parsed = JSON.parse(text)
        if (parsed?.magic === ENGINE_CLIPBOARD_MAGIC) engineClipboard = parsed.data
      } catch {
        // Not the engine's format.
      }
      if (engineClipboard !== undefined) {
        event.preventDefault()
        event.stopImmediatePropagation()
        const items = Array.isArray(engineClipboard) ? engineClipboard : []
        const nodes = items.flatMap((item) => {
          try {
            return [sanitizeNodeTree(item)]
          } catch {
            return []
          }
        })
        insertUnderSelection(nodes)
        return
      }
      if (!mind.currentNode) return
      event.preventDefault()
      event.stopImmediatePropagation()
      void parseOutline(text).then(insertUnderSelection, (error) => callbacks.current.onError?.(error))
    }
    element.addEventListener('paste', onPaste, true)
    mind.bus.addListener('operation', onOperation)
    mind.bus.addListener('expandNode', notify)
    mind.bus.addListener('changeDirection', notify)
    const lineColorOf = rendering.lineColorOf
    mind.bus.addListener('selectNodes', reportSelection)
    mind.bus.addListener('unselectNodes', reportSelection)

    const applyTheme = (refresh: boolean) => {
      rendering.applyTheme(savedTheme ?? systemTheme(darkQuery.matches), refresh)
    }
    const onSystemThemeChange = () => {
      if (!savedTheme) applyTheme(true)
    }
    darkQuery.addEventListener('change', onSystemThemeChange)

    /** Re-renders after changing node data directly, keeping the selection, as one undo step. */
    const commitNodeChange = (nodes: Topic[]) => {
      const ids = nodes.map((tpc) => tpc.nodeObj.id)
      mind.refresh()
      const reselect = ids.flatMap((id) => {
        try {
          return [mind.findEle(id)]
        } catch {
          return []
        }
      })
      if (reselect.length) mind.selectNodes(reselect)
      const obj = nodes[0].nodeObj
      mind.bus.fire('operation', { name: 'reshapeNode', obj, origin: obj })
    }

    const adapter: EditorApi = {
      getMap: () => {
        const data = mind.getData()
        // The engine always reports its current theme; only a chosen one is saved.
        delete data.theme
        const map = fromEngineData(data)
        if (savedTheme) map.theme = structuredClone(savedTheme)
        if (savedShape) map.shape = savedShape
        return map
      },
      load: (map: MindMap) => {
        if (mind.isFocusMode) mind.cancelFocus()
        mind.direction = map.direction ?? MindElixir.SIDE
        mind.compact = map.compact ?? false
        savedTheme = map.theme ? structuredClone(map.theme) : undefined
        savedShape = map.shape
        applyTheme(false)
        mind.refresh(map as unknown as MindElixirData)
        mind.clearHistory?.()
        fitToScreen(mind)
        reportSelection()
        return adapter.getMap()
      },
      undo: () => mind.undo(),
      redo: () => mind.redo(),
      withExportView: async (options, capture) => {
        // Selection outlines should not end up in exported images.
        mind.clearSelection()
        const theme = savedTheme ?? systemTheme(darkQuery.matches)
        const swap = options.light && theme.type === 'dark'
        // Briefly re-render in the light version; not an edit, so no undo step
        // and the map is not marked as changed.
        if (swap) rendering.applyTheme(lightVariantOf(theme), true)
        try {
          return await capture(mind.nodes, getComputedStyle(mind.container).backgroundColor || '#ffffff')
        } finally {
          if (swap) applyTheme(true)
        }
      },

      getTheme: () => savedTheme,
      effectiveTheme: () => savedTheme ?? systemTheme(darkQuery.matches),
      setTheme: (theme) => {
        savedTheme = theme ? structuredClone(theme) : undefined
        applyTheme(true)
        notify()
      },
      previewThemeVar: (cssVar, value) => mind.container.style.setProperty(cssVar, value),
      getShape: () => savedShape,
      setShape: (shape) => {
        savedShape = shape
        applyTheme(true)
        notify()
      },
      getDirection: () => mind.direction,
      setDirection: (direction) => {
        if (direction === mind.direction) return
        if (direction === MindElixir.LEFT) mind.initLeft()
        else if (direction === MindElixir.RIGHT) mind.initRight()
        else if (direction === MindElixir.DOWN) mind.initDown()
        else mind.initSide()
        notify()
      },
      isCompact: () => mind.compact,
      setCompact: (compact) => {
        mind.changeCompact(compact)
        notify()
      },
      selection,
      previewNodeStyle: (makePatch) => {
        for (const tpc of mind.currentNodes ?? []) {
          const node = selection().find((n) => n.id === tpc.nodeObj.id)!
          for (const [key, value] of Object.entries(makePatch(node))) {
            tpc.style.setProperty(key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), value ?? '')
          }
        }
      },
      applyNodeStyle: (makePatch) => {
        const nodes = [...(mind.currentNodes ?? [])]
        if (!nodes.length) return
        const selected = selection()
        nodes.forEach((tpc, index) => {
          const obj = tpc.nodeObj
          const style: Record<string, string> = { ...(obj.style as Record<string, string>) }
          for (const [key, value] of Object.entries(makePatch(selected[index]))) {
            if (value) style[key] = value
            else delete style[key]
          }
          if (Object.keys(style).length) obj.style = style
          else delete obj.style
        })
        commitNodeChange(nodes)
      },
      pasteOutline: async (text) => {
        if (!mind.currentNode) return false
        return insertUnderSelection(await parseOutline(text))
      },
      setBranchColor: (color) => {
        const nodes = (mind.currentNodes ?? []).filter((tpc) => tpc.nodeObj.parent)
        if (!nodes.length) return
        for (const tpc of nodes) {
          if (color) tpc.nodeObj.branchColor = color
          else delete tpc.nodeObj.branchColor
        }
        commitNodeChange(nodes)
      },
    }
    callbacks.current.onReady(adapter)

    return () => {
      element.removeEventListener('paste', onPaste, true)
      darkQuery.removeEventListener('change', onSystemThemeChange)
      callbacks.current.onReady(null)
      mind.destroy()
      mindRef.current = null
    }
    // The editor is created once; language and labels are updated below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const mind = mindRef.current
    if (!mind) return
    applyEngineLocale(mind, localeRef.current, language)
    mind.newTopicName = newTopicName
    const pasteItem = mind.container.querySelector(`#${PASTE_MENU_ID} span`)
    if (pasteItem) pasteItem.textContent = pasteLabel
  }, [language, newTopicName, pasteLabel])

  return <div ref={elementRef} className="canvas" role="application" aria-label={label} data-testid="canvas" />
}
