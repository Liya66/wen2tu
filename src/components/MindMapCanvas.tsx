import MindElixir, {
  type MindElixirData,
  type MindElixirInstance,
  type NodeObj,
  type Operation,
  type SubLineParams,
  type Theme,
  type Topic,
} from 'mind-elixir'
import { en as engineEn, zh_CN as engineZh, type LangPack } from 'mind-elixir/i18n'
import 'mind-elixir/style.css'
import { useEffect, useRef } from 'react'
import type { Language } from '../i18n'
import { fromEngineData } from '../features/mindmap/document'
import { escapeHtml } from '../features/mindmap/sanitize'
import { subBranchPath, topicKind } from '../features/appearance/branchPath'
import { toHexColor, type StylePatch } from '../features/appearance/nodeStyles'
import { lightVariantOf, systemTheme } from '../features/appearance/themes'
import type { Direction, MapNode, MapTheme, MindMap, ThemeVar } from '../features/mindmap/types'
import type { CanvasAdapter } from '../features/workspace/workspaceController'

const ENGINE_LOCALES: Record<Language, LangPack> = { en: engineEn, 'zh-CN': engineZh }

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
}

type SubBranch = NonNullable<Theme['generateSubBranch']>

function toEngineTheme(theme: MapTheme, generateSubBranch?: SubBranch): Theme {
  return {
    name: theme.name,
    type: theme.type,
    palette: [...theme.palette],
    cssVar: { ...theme.cssVar },
    generateSubBranch,
  }
}

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
}

export function MindMapCanvas({ language, label, newTopicName, onReady, onChange, onSelectionChange }: Props) {
  const elementRef = useRef<HTMLDivElement>(null)
  const mindRef = useRef<MindElixirInstance | null>(null)
  const localeRef = useRef<LangPack>({ ...ENGINE_LOCALES[language] })
  const callbacks = useRef({ onReady, onChange, onSelectionChange })

  useEffect(() => {
    callbacks.current = { onReady, onChange, onSelectionChange }
  })

  useEffect(() => {
    const element = elementRef.current
    if (!element) return
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
    /** The theme stored in the current map; undefined = follow the system. */
    let savedTheme: MapTheme | undefined

    const mind = new MindElixir({
      el: element,
      direction: MindElixir.SIDE,
      editable: true,
      toolBar: true,
      keypress: true,
      allowUndo: true,
      newTopicName,
      contextMenu: { locale: localeRef.current, focus: true, link: true },
      // Without a markdown function, arrow and summary labels are inserted
      // as raw HTML. Escaping everything keeps user text as plain text.
      markdown: (text) => escapeHtml(text),
      theme: toEngineTheme(systemTheme(darkQuery.matches)),
    })
    mind.init(MindElixir.new(''))
    mindRef.current = mind

    // Branch lines: the engine underlines every subtopic. Styled topics
    // (boxed, filled or with their own underline) are joined differently, see
    // subBranchPath. The engine only passes geometry, so styled topics are
    // looked up by the position of their wrapper, indexed once per layout pass.
    const defaultSubBranch = mind.generateSubBranch
    let styledIndex: Map<string, Topic> | null = null
    const engineLinkDiv = mind.linkDiv
    mind.linkDiv = function (...args) {
      styledIndex = null
      return engineLinkDiv.apply(this, args)
    }
    const styledTopicAt = (top: number, left: number, width: number, height: number) => {
      if (!styledIndex) {
        styledIndex = new Map()
        for (const tpc of mind.nodes.querySelectorAll<Topic>('me-children me-tpc')) {
          if (!topicKind(tpc.nodeObj?.style as MapNode['style'])) continue
          const wrapper = tpc.parentElement!
          const key = `${wrapper.offsetTop},${wrapper.offsetLeft},${wrapper.offsetWidth},${wrapper.offsetHeight}`
          if (!styledIndex.has(key)) styledIndex.set(key, tpc)
        }
      }
      return styledIndex.get(`${top},${left},${width},${height}`)
    }
    const styledSubBranch: SubBranch = function (this: MindElixirInstance, params: SubLineParams) {
      if (params.direction !== 'lhs' && params.direction !== 'rhs') return defaultSubBranch.call(this, params)
      const childTopic = styledTopicAt(params.cT, params.cL, params.cW, params.cH)
      const parentTopic = params.isFirst ? undefined : styledTopicAt(params.pT, params.pL, params.pW, params.pH)
      if (!childTopic && !parentTopic) return defaultSubBranch.call(this, params)
      const gap = parseInt(this.container.style.getPropertyValue('--node-gap-x')) || 30
      const child = childTopic && {
        kind: topicKind(childTopic.nodeObj.style as MapNode['style'])!,
        top: params.cT + childTopic.offsetTop,
        left: params.cL + childTopic.offsetLeft,
        width: childTopic.offsetWidth,
        height: childTopic.offsetHeight,
      }
      const parentKind = parentTopic ? (topicKind(parentTopic.nodeObj.style as MapNode['style']) ?? undefined) : undefined
      return subBranchPath(params, gap, child, parentKind)
    }

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
    mind.bus.addListener('operation', onOperation)
    mind.bus.addListener('expandNode', notify)
    mind.bus.addListener('changeDirection', notify)
    // The engine paints first-level topics' borders in their branch color on
    // every layout. Remember that color (subtopics inherit it), then let a
    // border chosen in the style panel win.
    const mainBranchColors = new WeakMap<NodeObj, string>()
    const afterLinkDiv = () => {
      for (const tpc of mind.nodes.querySelectorAll<Topic>('me-main > me-wrapper > me-parent > me-tpc')) {
        if (tpc.style.borderColor) mainBranchColors.set(tpc.nodeObj, toHexColor(tpc.style.borderColor))
        const style = tpc.nodeObj?.style as MapNode['style'] | undefined
        if (style?.border) tpc.style.border = style.border
        if (style?.borderBottom) tpc.style.borderBottom = style.borderBottom
      }
    }
    mind.bus.addListener('linkDiv', afterLinkDiv)
    const lineColorOf = (node: NodeObj): string | undefined => {
      for (let current: NodeObj | undefined = node; current?.parent; current = current.parent) {
        if (current.branchColor) return current.branchColor
        if (!current.parent.parent) return mainBranchColors.get(current)
      }
      return undefined
    }
    mind.bus.addListener('selectNodes', reportSelection)
    mind.bus.addListener('unselectNodes', reportSelection)

    const applyTheme = (refresh: boolean) => {
      mind.changeTheme(toEngineTheme(savedTheme ?? systemTheme(darkQuery.matches), styledSubBranch), refresh)
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
        return map
      },
      load: (map: MindMap) => {
        if (mind.isFocusMode) mind.cancelFocus()
        mind.direction = map.direction ?? MindElixir.SIDE
        mind.compact = map.compact ?? false
        savedTheme = map.theme ? structuredClone(map.theme) : undefined
        applyTheme(false)
        mind.refresh(map as unknown as MindElixirData)
        mind.clearHistory?.()
        mind.toCenter()
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
        if (swap) mind.changeTheme(toEngineTheme(lightVariantOf(theme), styledSubBranch), true)
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
  }, [language, newTopicName])

  return <div ref={elementRef} className="canvas" role="application" aria-label={label} data-testid="canvas" />
}
