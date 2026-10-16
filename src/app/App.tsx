import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog } from '../components/Dialog'
import { FileSidebar } from '../components/FileSidebar'
import { MindMapCanvas, type EditorApi, type SelectedNode } from '../components/MindMapCanvas'
import { NoticeArea } from '../components/NoticeArea'
import { PasteDialog } from '../components/PasteDialog'
import { ShortcutsDialog } from '../components/ShortcutsDialog'
import { StatusBar } from '../components/StatusBar'
import { StylePanel } from '../components/StylePanel'
import { TemplateDialog } from '../components/TemplateDialog'
import { applyTemplateLook, createMapFromTemplate } from '../features/appearance/templates'
import { looksLikeOutline } from '../features/import-export/outlineText'
import { createWelcomeMap } from '../features/onboarding/welcomeMap'
import { Toolbar } from '../components/Toolbar'
import { WorkspaceController, type DocSummary } from '../features/workspace/workspaceController'
import i18n, { LANGUAGES, type Language } from '../i18n'

const WIDE_SCREEN = '(min-width: 800px)'
const STYLE_PANEL_KEY = 'wen2tu.stylePanel'

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    // Preference just won't persist.
  }
}

function currentLanguage(): Language {
  return (LANGUAGES as readonly string[]).includes(i18n.resolvedLanguage ?? '') ? (i18n.resolvedLanguage as Language) : 'en'
}

function createController() {
  return new WorkspaceController(
    () => ({
      untitled: i18n.t('map.untitled'),
      rootTopic: i18n.t('map.rootTopic'),
      nativeFileType: i18n.t('fileTypes.native'),
    supportedFileTypes: i18n.t('fileTypes.supported'),
    }),
    undefined,
    () => createWelcomeMap(currentLanguage()),
  )
}

/** Commits an in-progress node edit so shortcuts like Save include it. */
function commitActiveEdit() {
  const active = document.activeElement
  if (active instanceof HTMLElement && active.id === 'input-box') active.blur()
}

export function App() {
  const { t, i18n: i18nInstance } = useTranslation()
  const [controller] = useState(createController)
  const state = useSyncExternalStore(controller.subscribe, controller.getState)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia(WIDE_SCREEN).matches)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<DocSummary | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [removeTarget, setRemoveTarget] = useState<DocSummary | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  /** Which paste box is open: for a new map, or to add under the selected topic. */
  const [pasteMode, setPasteMode] = useState<'new' | 'insert' | null>(null)
  const [styleOpen, setStyleOpen] = useState(() => readFlag(STYLE_PANEL_KEY))
  const [editor, setEditor] = useState<EditorApi | null>(null)
  const editorRef = useRef<EditorApi | null>(null)
  const [selection, setSelection] = useState<SelectedNode[]>([])

  const language: Language = (LANGUAGES as readonly string[]).includes(i18nInstance.resolvedLanguage ?? '')
    ? (i18nInstance.resolvedLanguage as Language)
    : 'en'

  const onCanvasReady = useCallback(
    (adapter: EditorApi | null) => {
      controller.attachCanvas(adapter)
      editorRef.current = adapter
      setEditor(adapter)
    },
    [controller],
  )
  /**
   * “Paste outline” from the topic menu: read the clipboard directly when the
   * browser allows it, otherwise open the paste box for this topic.
   */
  const pasteIntoSelection = async () => {
    let text = ''
    try {
      text = (await navigator.clipboard?.readText?.()) ?? ''
    } catch {
      // Not supported or permission denied: fall back to the paste box.
    }
    if (text.trim() && (await editorRef.current?.pasteOutline(text).catch(() => false))) return
    setPasteMode('insert')
  }

  const toggleStyle = () =>
    setStyleOpen((open) => {
      writeFlag(STYLE_PANEL_KEY, !open)
      return !open
    })
  const onCanvasChange = useCallback(() => controller.notifyChange(), [controller])

  // An untouched welcome map follows the interface language.
  useEffect(() => {
    const onLanguageChanged = () => controller.relocalizeWelcome()
    i18n.on('languageChanged', onLanguageChanged)
    return () => i18n.off('languageChanged', onLanguageChanged)
  }, [controller])

  // Global shortcuts and page lifecycle.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 's') {
        event.preventDefault()
        commitActiveEdit()
        void (event.shiftKey ? controller.saveAs() : controller.save())
      } else if (key === 'o') {
        event.preventDefault()
        commitActiveEdit()
        void controller.openFile()
      }
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (controller.shouldWarnBeforeUnload()) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    // Pasting an outline with no topic selected creates a new map. (With a
    // topic selected, the editor handles the paste and inserts subtopics.)
    const onPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, dialog, [contenteditable]')) return
      const text = event.clipboardData?.getData('text/plain')
      if (!text) return
      // A topic is selected but the editor isn't focused: still paste into it.
      const editor = editorRef.current
      if (editor?.selection().length) {
        event.preventDefault()
        void editor.pasteOutline(text).catch((error) => controller.reportError(error))
        return
      }
      if (!looksLikeOutline(text)) return
      event.preventDefault()
      void controller.importText(text)
    }
    const onHide = () => controller.flush()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') controller.flush()
      else void controller.checkExternalChange()
    }
    const onFocus = () => void controller.checkExternalChange()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('paste', onPaste)
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('pagehide', onHide)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('pagehide', onHide)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [controller])

  const conflictDoc = state.docs.find((doc) => doc.id === state.conflictDocId)
  const removeIsDirty = removeTarget ? controller.isDirty(removeTarget.id) : false

  const submitRename = () => {
    if (renameTarget) controller.renameDoc(renameTarget.id, renameValue)
    setRenameTarget(null)
  }

  return (
    <div className="app" data-sidebar={sidebarOpen ? 'open' : 'closed'}>
      <Toolbar
        controller={controller}
        state={state}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
        onShowShortcuts={() => setShortcutsOpen(true)}
        onShowTemplates={() => setTemplatesOpen(true)}
        onShowPaste={() => setPasteMode('new')}
        styleOpen={styleOpen}
        onToggleStyle={toggleStyle}
      />
      <div className="workspace">
        <FileSidebar
          controller={controller}
          docs={state.docs}
          activeId={state.active?.id ?? null}
          open={sidebarOpen}
          onSelect={(doc) => {
            controller.switchTo(doc.id)
            // On small screens the list covers the map; get it out of the way.
            if (!window.matchMedia(WIDE_SCREEN).matches) setSidebarOpen(false)
          }}
          onRename={(doc) => {
            setRenameValue(doc.title)
            setRenameTarget(doc)
          }}
          onRemove={(doc) => setRemoveTarget(doc)}
        />
        <main className="stage">
          <h1 className="visually-hidden">{state.active?.title ?? t('app.name')}</h1>
          <NoticeArea notices={state.notices} controller={controller} />
          <MindMapCanvas
            language={language}
            label={t('map.label')}
            newTopicName={t('map.newNode')}
            onReady={onCanvasReady}
            onChange={onCanvasChange}
            onSelectionChange={setSelection}
            onError={(error) => controller.reportError(error)}
            pasteLabel={t('paste.menuItem')}
            onPasteRequest={() => void pasteIntoSelection()}
          />
        </main>
        {styleOpen && <StylePanel editor={editor} selection={selection} onClose={toggleStyle} />}
      </div>
      <StatusBar active={state.active} fileSystemAccess={state.fileSystemAccess} autoWrite={state.autoWrite} />

      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <PasteDialog
        open={pasteMode !== null}
        mode={pasteMode ?? 'new'}
        onClose={() => setPasteMode(null)}
        onCreate={async (text) => {
          // If the topic is no longer selected, the outline still isn't lost: it becomes a new map.
          if (pasteMode === 'insert' && (await editorRef.current?.pasteOutline(text))) return true
          return controller.importText(text)
        }}
      />

      <TemplateDialog
        open={templatesOpen}
        language={language}
        onClose={() => setTemplatesOpen(false)}
        onPick={(template) => {
          const map = createMapFromTemplate(template, language)
          controller.newDoc(map, template.id === 'blank' ? undefined : map.nodeData.topic)
        }}
        onApply={(template, text) => controller.importText(text, (map) => applyTemplateLook(map, template))}
      />

      <Dialog
        open={Boolean(state.conflictDocId)}
        title={t('dialogs.conflictTitle')}
        onClose={() => void controller.resolveConflict('cancel')}
        actions={
          <>
            <button type="button" className="button" onClick={() => void controller.resolveConflict('cancel')}>
              {t('dialogs.cancel')}
            </button>
            <button type="button" className="button" onClick={() => void controller.resolveConflict('reload')}>
              {t('dialogs.conflictReload')}
            </button>
            <button type="button" className="button" onClick={() => void controller.resolveConflict('saveAs')}>
              {t('dialogs.conflictSaveAs')}
            </button>
            <button
              type="button"
              className="button danger"
              onClick={() => void controller.resolveConflict('overwrite')}
            >
              {t('dialogs.conflictOverwrite')}
            </button>
          </>
        }
      >
        <p>{t('dialogs.conflictBody', { file: conflictDoc?.title ?? '' })}</p>
      </Dialog>

      <Dialog
        open={Boolean(removeTarget)}
        title={t('dialogs.removeTitle', { title: removeTarget?.title ?? '' })}
        onClose={() => setRemoveTarget(null)}
        actions={
          <>
            <button type="button" className="button" onClick={() => setRemoveTarget(null)}>
              {t('dialogs.cancel')}
            </button>
            <button
              type="button"
              className="button danger"
              onClick={() => {
                if (removeTarget) void controller.removeDoc(removeTarget.id)
                setRemoveTarget(null)
              }}
            >
              {t('dialogs.removeConfirm')}
            </button>
          </>
        }
      >
        <p>{removeIsDirty ? t('dialogs.removeBodyDirty') : t('dialogs.removeBodyClean')}</p>
      </Dialog>

      <Dialog
        open={Boolean(renameTarget)}
        title={t('dialogs.renameTitle')}
        onClose={() => setRenameTarget(null)}
        onSubmit={submitRename}
        actions={
          <>
            <button type="button" className="button" onClick={() => setRenameTarget(null)}>
              {t('dialogs.cancel')}
            </button>
            <button type="submit" className="button primary">
              {t('dialogs.renameConfirm')}
            </button>
          </>
        }
      >
        <label className="field">
          <span>{t('dialogs.renameLabel')}</span>
          <input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            maxLength={200}
            autoFocus
            onFocus={(event) => event.target.select()}
            required
          />
        </label>
      </Dialog>
    </div>
  )
}
