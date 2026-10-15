import MindElixir, { type MindElixirData, type MindElixirInstance, type Operation } from 'mind-elixir'
import { en as engineEn, zh_CN as engineZh, type LangPack } from 'mind-elixir/i18n'
import 'mind-elixir/style.css'
import { useEffect, useRef } from 'react'
import type { Language } from '../i18n'
import { fromEngineData } from '../features/mindmap/document'
import { escapeHtml } from '../features/mindmap/sanitize'
import type { MindMap } from '../features/mindmap/types'
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

interface Props {
  language: Language
  label: string
  newTopicName: string
  onReady: (adapter: CanvasAdapter | null) => void
  onChange: () => void
}

export function MindMapCanvas({ language, label, newTopicName, onReady, onChange }: Props) {
  const elementRef = useRef<HTMLDivElement>(null)
  const mindRef = useRef<MindElixirInstance | null>(null)
  const localeRef = useRef<LangPack>({ ...ENGINE_LOCALES[language] })
  const callbacks = useRef({ onReady, onChange })

  useEffect(() => {
    callbacks.current = { onReady, onChange }
  })

  useEffect(() => {
    const element = elementRef.current
    if (!element) return
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

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
      theme: darkQuery.matches ? MindElixir.DARK_THEME : MindElixir.THEME,
    })
    mind.init(MindElixir.new(''))
    mindRef.current = mind

    const notify = () => callbacks.current.onChange()
    // Undo and redo re-render from snapshots without emitting an operation.
    const engineUndo = mind.undo
    const engineRedo = mind.redo
    mind.undo = () => {
      engineUndo.call(mind)
      notify()
    }
    mind.redo = () => {
      engineRedo.call(mind)
      notify()
    }
    const onOperation = (operation: Operation) => {
      if (operation.name !== 'beginEdit') notify()
    }
    mind.bus.addListener('operation', onOperation)
    mind.bus.addListener('expandNode', notify)
    mind.bus.addListener('changeDirection', notify)

    const onThemeChange = (event: MediaQueryListEvent) => {
      mind.changeTheme(event.matches ? MindElixir.DARK_THEME : MindElixir.THEME)
    }
    darkQuery.addEventListener('change', onThemeChange)

    const adapter: CanvasAdapter = {
      getMap: () => fromEngineData(mind.getData()),
      load: (map: MindMap) => {
        if (mind.isFocusMode) mind.cancelFocus()
        mind.direction = map.direction ?? MindElixir.SIDE
        mind.compact = map.compact ?? false
        mind.refresh(map as unknown as MindElixirData)
        mind.clearHistory?.()
        mind.toCenter()
        return fromEngineData(mind.getData())
      },
      undo: () => mind.undo(),
      redo: () => mind.redo(),
      exportTarget: () => {
        // Selection outlines should not end up in exported images.
        mind.clearSelection()
        return mind.nodes
      },
      backgroundColor: () => getComputedStyle(mind.container).backgroundColor || '#ffffff',
    }
    callbacks.current.onReady(adapter)

    return () => {
      darkQuery.removeEventListener('change', onThemeChange)
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
