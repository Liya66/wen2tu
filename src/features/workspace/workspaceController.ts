import { downloadBlob, downloadText, pickFileWithInput } from '../file-manager/downloadAdapter'
import {
  ensurePermission,
  getLastModified,
  isSameFile,
  pickFileWithHandle,
  pickSaveHandle,
  readHandle,
  supportsFileSystemAccess,
  writeHandle,
  type PickedFile,
} from '../file-manager/fileSystemAdapter'
import { exportImage, type ImageFormat } from '../import-export/exportImage'
import { exportMarkdown } from '../import-export/markdownExport'
import { SUPPORTED_ACCEPT, SUPPORTED_EXTENSIONS, readSource } from '../import-export/readSource'
import { createMap, fileNameForTitle, parseDocument, serializeMap, titleFromFileName } from '../mindmap/document'
import { DocumentError } from '../mindmap/errors'
import type { MindMap } from '../mindmap/types'
import { createId } from '../../utils/id'
import { openWorkspaceStore, type WorkspaceDoc, type WorkspaceStore } from './workspaceStore'

/** What the controller needs from the map editor. */
export interface CanvasAdapter {
  getMap(): MindMap
  /** Replaces the map, clears undo history and returns the map as the engine normalized it. */
  load(map: MindMap): MindMap
  undo(): void
  redo(): void
  /**
   * Gets the map ready for an image export (no selection; with `light`, dark
   * color schemes swapped for their light version), runs `capture` with the
   * element to capture and its background color, then restores the view.
   */
  withExportView<T>(
    options: { light: boolean },
    capture: (target: HTMLElement, background: string) => Promise<T>,
  ): Promise<T>
}

/** Strings the controller puts into user data (new map names, root topics). */
export interface ControllerTexts {
  untitled: string
  rootTopic: string
  nativeFileType: string
  supportedFileTypes: string
}

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

export interface MessageRef {
  key: string
  detail?: string
}

export type Notice =
  | { id: string; kind: 'recovered'; docId: string }
  | { id: string; kind: 'external-change'; docId: string }
  | { id: string; kind: 'downloaded'; fileName: string }
  | { id: string; kind: 'imported'; fileName: string }
  | { id: string; kind: 'storage-unavailable' }
  | { id: string; kind: 'error'; message: MessageRef }

type NoticeInput = Notice extends infer N ? (N extends Notice ? Omit<N, 'id'> : never) : never

export interface DocSummary {
  id: string
  title: string
  linked: boolean
  dirty: boolean
  lastOpenedAt: number
}

export interface ActiveDoc {
  id: string
  title: string
  fileName?: string
  linked: boolean
  saveState: SaveState
  /** Whether a saved copy exists at all (file written, opened or downloaded). */
  hasSavedCopy: boolean
  savedVia?: 'file' | 'download'
  /** Auto-write is on but the browser needs a click/keypress to grant file access again. */
  needsPermission: boolean
}

export interface WorkspaceState {
  ready: boolean
  docs: DocSummary[]
  active: ActiveDoc | null
  notices: Notice[]
  /** Set when saving would overwrite a file that changed on disk. */
  conflictDocId: string | null
  autoWrite: boolean
  fileSystemAccess: boolean
  persistent: boolean
}

const PERSIST_DELAY = 300
const AUTO_WRITE_DELAY = 1500

function isPlatformRefusal(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
}

function isDirty(doc: WorkspaceDoc): boolean {
  return doc.savedText === undefined || doc.workingText !== doc.savedText
}

export function toMessage(error: unknown): MessageRef {
  if (error instanceof DocumentError) return { key: `errors.${error.code}`, detail: error.detail }
  if (error instanceof DOMException && error.name === 'NotFoundError') return { key: 'errors.fileMissing' }
  if (error instanceof DOMException && error.name === 'NotAllowedError') return { key: 'errors.permissionDenied' }
  return { key: 'errors.unknown', detail: error instanceof Error ? error.message : String(error) }
}

/**
 * Owns the workspace: which maps exist, which one is open, and moving content
 * between the editor, browser storage and files on disk. React subscribes to
 * it through `subscribe` / `getState`.
 *
 * Safety rules it enforces:
 * - The current map is only replaced after a new file has fully validated.
 * - Every edit is copied to browser storage shortly after it happens.
 * - Writes to disk are serialized, and never overwrite a file that changed
 *   on disk since it was last read without asking first.
 */
export class WorkspaceController {
  private state: WorkspaceState
  private readonly listeners = new Set<() => void>()
  private readonly texts: () => ControllerTexts
  private readonly openStore: () => Promise<WorkspaceStore>
  private readonly welcome?: () => { title: string; map: MindMap }
  /** The welcome map and its content when created, to tell whether it was edited. */
  private welcomeRecord: { id: string; text: string } | null = null
  private store: WorkspaceStore | null = null
  private canvas: CanvasAdapter | null = null
  private readonly docs = new Map<string, WorkspaceDoc>()
  private activeId: string | null = null
  private startPromise: Promise<void> | null = null
  private notices: Notice[] = []
  private conflictDocId: string | null = null
  private autoWrite = false
  private pendingChange = false
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private autoWriteTimer: ReturnType<typeof setTimeout> | null = null
  private writeChain: Promise<unknown> = Promise.resolve()
  private savingDocId: string | null = null
  private failedDocId: string | null = null
  private permissionDocId: string | null = null
  private storageErrorShown = false

  constructor(
    texts: () => ControllerTexts,
    openStore: () => Promise<WorkspaceStore> = openWorkspaceStore,
    /** Builds the map shown on a first visit (empty workspace). */
    welcome?: () => { title: string; map: MindMap },
  ) {
    this.texts = texts
    this.openStore = openStore
    this.welcome = welcome
    this.state = this.computeState(false)
  }

  // ---- subscription -------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState = (): WorkspaceState => this.state

  private ready = false

  private emit() {
    this.state = this.computeState(this.ready)
    for (const listener of this.listeners) listener()
  }

  private computeState(ready: boolean): WorkspaceState {
    const docs = [...this.docs.values()]
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
      .map((doc) => ({
        id: doc.id,
        title: doc.title,
        linked: Boolean(doc.handle),
        dirty: isDirty(doc) || (doc.id === this.activeId && this.pendingChange),
        lastOpenedAt: doc.lastOpenedAt,
      }))
    const doc = this.activeDoc()
    let active: ActiveDoc | null = null
    if (doc) {
      const dirty = isDirty(doc) || this.pendingChange
      let saveState: SaveState = dirty ? 'dirty' : 'saved'
      if (this.failedDocId === doc.id) saveState = 'error'
      if (this.savingDocId === doc.id) saveState = 'saving'
      active = {
        id: doc.id,
        title: doc.title,
        fileName: doc.fileName,
        linked: Boolean(doc.handle),
        saveState,
        hasSavedCopy: doc.savedText !== undefined,
        savedVia: doc.savedVia,
        needsPermission: this.permissionDocId === doc.id,
      }
    }
    return {
      ready,
      docs,
      active,
      notices: this.notices,
      conflictDocId: this.conflictDocId,
      autoWrite: this.autoWrite,
      fileSystemAccess: supportsFileSystemAccess(),
      persistent: this.store?.persistent ?? true,
    }
  }

  private activeDoc(): WorkspaceDoc | undefined {
    return this.activeId ? this.docs.get(this.activeId) : undefined
  }

  // ---- notices ------------------------------------------------------------

  private addNotice(notice: NoticeInput) {
    const full = { ...notice, id: createId() } as Notice
    // Only one notice of each kind per document stays visible.
    this.notices = [
      ...this.notices.filter(
        (n) => !(n.kind === full.kind && ('docId' in n ? n.docId === (full as { docId?: string }).docId : true)),
      ),
      full,
    ]
    this.emit()
  }

  private showError(error: unknown) {
    console.error('[wen2tu]', error)
    this.addNotice({ kind: 'error', message: toMessage(error) })
  }

  dismissNotice(id: string) {
    this.notices = this.notices.filter((n) => n.id !== id)
    this.emit()
  }

  // ---- lifecycle ----------------------------------------------------------

  /** Called by the editor when it mounts (with an adapter) and unmounts (with null). */
  attachCanvas(adapter: CanvasAdapter | null) {
    if (!adapter) {
      if (this.canvas) this.flush()
      this.canvas = null
      return
    }
    this.canvas = adapter
    if (!this.startPromise) {
      this.startPromise = this.start().catch((error) => this.showError(error))
    } else {
      void this.startPromise.then(() => {
        const doc = this.activeDoc()
        if (doc && this.canvas === adapter) this.loadIntoCanvas(doc)
      })
    }
  }

  private async start() {
    this.store = await this.openStore()
    this.autoWrite = (await this.store.getSetting<boolean>('autoWrite')) ?? false
    for (const doc of await this.store.listDocs()) this.docs.set(doc.id, doc)

    let activeId = await this.store.getSetting<string>('activeDocId')
    if (!activeId || !this.docs.has(activeId)) {
      activeId = [...this.docs.values()].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)[0]?.id
    }
    this.welcomeRecord = (await this.store.getSetting<{ id: string; text: string }>('welcome')) ?? null
    let isWelcome = false
    if (!activeId) {
      const first = this.welcome?.()
      isWelcome = Boolean(first)
      activeId = (first ? this.createDraft(first.map, first.title) : this.createDraft(createMap(this.texts().rootTopic))).id
    }

    this.activate(activeId)
    if (isWelcome) this.rememberWelcome(activeId)
    const doc = this.activeDoc()
    if (doc && doc.savedText !== undefined && isDirty(doc)) this.addNotice({ kind: 'recovered', docId: doc.id })
    if (!this.store.persistent) this.addNotice({ kind: 'storage-unavailable' })
    this.ready = true
    this.emit()
    void this.checkExternalChange()
  }

  private uniqueTitle(base: string): string {
    const titles = new Set([...this.docs.values()].map((d) => d.title))
    if (!titles.has(base)) return base
    let n = 2
    while (titles.has(`${base} ${n}`)) n++
    return `${base} ${n}`
  }

  private createDraft(map: MindMap, title = this.uniqueTitle(this.texts().untitled)): WorkspaceDoc {
    const now = Date.now()
    const doc: WorkspaceDoc = {
      id: createId(),
      title,
      workingText: serializeMap(map),
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    }
    this.docs.set(doc.id, doc)
    void this.saveRecord(doc)
    return doc
  }

  private async saveRecord(doc: WorkspaceDoc) {
    try {
      await this.store?.putDoc({ ...doc })
    } catch (error) {
      if (!this.storageErrorShown) {
        this.storageErrorShown = true
        this.addNotice({ kind: 'error', message: { key: 'errors.storage', detail: String(error) } })
      }
    }
  }

  /**
   * Shows `doc` in the editor. Loading goes through the engine, which may
   * normalize the data (e.g. assign sides to branches); such normalization is
   * not a user change, so it is folded into the saved baseline.
   */
  private loadIntoCanvas(doc: WorkspaceDoc) {
    let map: MindMap
    try {
      map = parseDocument(doc.workingText).map
    } catch (error) {
      // The working copy is unreadable; fall back to the saved copy if any.
      this.showError(error)
      map = doc.savedText ? parseDocument(doc.savedText).map : createMap(this.texts().rootTopic)
    }
    if (!this.canvas) return
    const normalized = serializeMap(this.canvas.load(map))
    if (normalized !== doc.workingText) {
      const wasClean = !isDirty(doc)
      doc.workingText = normalized
      if (wasClean) doc.savedText = normalized
      void this.saveRecord(doc)
    }
  }

  private activate(id: string) {
    const doc = this.docs.get(id)
    if (!doc) return
    this.cancelTimers()
    this.pendingChange = false
    this.activeId = id
    this.conflictDocId = null
    doc.lastOpenedAt = Date.now()
    this.loadIntoCanvas(doc)
    void this.saveRecord(doc)
    void this.store?.setSetting('activeDocId', id)
    this.emit()
  }

  private cancelTimers() {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    if (this.autoWriteTimer) clearTimeout(this.autoWriteTimer)
    this.persistTimer = this.autoWriteTimer = null
  }

  // ---- editing ------------------------------------------------------------

  /** Called by the editor after every change (edits, undo/redo, collapsing…). */
  notifyChange() {
    if (!this.activeId) return
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => this.persistWorking(), PERSIST_DELAY)
    if (!this.pendingChange) {
      this.pendingChange = true
      this.emit()
    }
  }

  /** Copies the editor's content into the working copy right away. */
  flush() {
    if (this.persistTimer) this.persistWorking()
  }

  private persistWorking() {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = null
    this.pendingChange = false
    const doc = this.activeDoc()
    if (!doc || !this.canvas) return
    let text: string
    try {
      text = serializeMap(this.canvas.getMap())
    } catch (error) {
      this.showError(error)
      return
    }
    if (text !== doc.workingText) {
      doc.workingText = text
      doc.updatedAt = Date.now()
      void this.saveRecord(doc)
    }
    this.emit()
    if (this.autoWrite && doc.handle && isDirty(doc)) this.scheduleAutoWrite(doc)
  }

  private scheduleAutoWrite(doc: WorkspaceDoc) {
    if (this.autoWriteTimer) clearTimeout(this.autoWriteTimer)
    this.autoWriteTimer = setTimeout(() => {
      this.autoWriteTimer = null
      if (isDirty(doc) && doc.handle) void this.writeToFile(doc, { interactive: false })
    }, AUTO_WRITE_DELAY)
  }

  undo() {
    this.canvas?.undo()
  }

  redo() {
    this.canvas?.redo()
  }

  // ---- workspace management ----------------------------------------------

  /** Creates a new map (blank, or e.g. from a template) and opens it. */
  newDoc(map: MindMap = createMap(this.texts().rootTopic), title?: string) {
    this.flush()
    const doc = title ? this.createDraft(map, this.uniqueTitle(title)) : this.createDraft(map)
    this.activate(doc.id)
  }

  /** Opens a fresh copy of the welcome map. */
  openWelcome() {
    const welcome = this.welcome?.()
    if (!welcome) return
    this.newDoc(welcome.map, welcome.title)
    if (this.activeId) this.rememberWelcome(this.activeId)
  }

  private rememberWelcome(id: string) {
    const doc = this.docs.get(id)
    if (!doc) return
    this.welcomeRecord = { id, text: doc.workingText }
    void this.store?.setSetting('welcome', this.welcomeRecord)
  }

  /**
   * Called after the interface language changes: a welcome map nobody has
   * edited is swapped for the version in the new language.
   */
  relocalizeWelcome() {
    this.flush()
    const record = this.welcomeRecord
    const doc = record ? this.docs.get(record.id) : undefined
    if (!record || !doc || !this.welcome || doc.workingText !== record.text) return
    const fresh = this.welcome()
    doc.title = fresh.title
    doc.workingText = serializeMap(fresh.map)
    void this.saveRecord(doc)
    if (doc.id === this.activeId) this.activate(doc.id)
    this.rememberWelcome(doc.id)
    this.emit()
  }

  switchTo(id: string) {
    if (id === this.activeId) return
    this.flush()
    this.activate(id)
  }

  isDirty(id: string): boolean {
    const doc = this.docs.get(id)
    return doc ? isDirty(doc) : false
  }

  renameDoc(id: string, title: string) {
    const doc = this.docs.get(id)
    const clean = title.trim().slice(0, 200)
    // Linked maps are named after their file.
    if (!doc || doc.handle || !clean) return
    doc.title = clean
    void this.saveRecord(doc)
    this.emit()
  }

  async removeDoc(id: string) {
    if (!this.docs.has(id)) return
    this.flush()
    this.docs.delete(id)
    this.notices = this.notices.filter((n) => !('docId' in n && n.docId === id))
    await this.store?.deleteDoc(id)
    if (id === this.activeId) {
      this.activeId = null
      const next = [...this.docs.values()].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)[0]
      this.activate(next ? next.id : this.createDraft(createMap(this.texts().rootTopic)).id)
    } else {
      this.emit()
    }
  }

  async setAutoWrite(enabled: boolean) {
    this.autoWrite = enabled
    await this.store?.setSetting('autoWrite', enabled)
    this.emit()
    const doc = this.activeDoc()
    if (enabled && doc?.handle && isDirty(doc)) this.scheduleAutoWrite(doc)
  }

  // ---- opening & importing ------------------------------------------------

  /**
   * Opens any supported file. `.mind.json` files stay linked to the file on
   * disk; Markdown and OPML become new maps (saving never overwrites them).
   */
  async openFile() {
    this.flush()
    let picked: PickedFile | null = null
    if (supportsFileSystemAccess()) {
      try {
        picked = await pickFileWithHandle(this.texts().supportedFileTypes, SUPPORTED_ACCEPT)
        if (!picked) return
      } catch (error) {
        // Some embedded or locked-down browsers expose the API but refuse to
        // use it; the classic file input still works there.
        console.warn('[wen2tu] file picker unavailable, using file input', error)
      }
    }
    try {
      picked ??= await pickFileWithInput(SUPPORTED_EXTENSIONS)
    } catch (error) {
      return this.showError(error)
    }
    if (picked) await this.openPicked(picked)
  }

  /**
   * Creates a new map from pasted text (Markdown or an indented outline).
   * Returns false, with an error notice, if nothing usable was found.
   */
  async importText(text: string): Promise<boolean> {
    this.flush()
    try {
      const { outlineToMap } = await import('../import-export/outlineText')
      const { map, title } = await outlineToMap(text, this.texts().untitled)
      this.newDoc(map, title)
      return true
    } catch (error) {
      this.showError(error)
      return false
    }
  }

  /** Reports a problem that happened outside the controller (e.g. in the editor). */
  reportError(error: unknown) {
    this.showError(error)
  }

  /** Same picker as Open; kept as its own entry point for discoverability. */
  importFile() {
    return this.openFile()
  }

  /** Validates a picked file and opens it. On any error the current map is left as is. */
  async openPicked(picked: PickedFile) {
    let result
    try {
      result = await readSource(picked.name, picked.text)
    } catch (error) {
      return this.showError(error)
    }

    if (result.kind !== 'native') {
      const doc = this.createDraft(result.map, this.uniqueTitle(result.title))
      this.activate(doc.id)
      this.addNotice({ kind: 'imported', fileName: picked.name })
      return
    }

    const text = serializeMap(result.map)

    if (picked.handle) {
      for (const existing of this.docs.values()) {
        if (!existing.handle || !(await isSameFile(existing.handle, picked.handle))) continue
        // Already in the workspace: refresh from disk unless there are local edits.
        if (!isDirty(existing)) {
          existing.workingText = existing.savedText = text
          existing.fileLastModified = picked.lastModified
        } else if (existing.fileLastModified !== picked.lastModified) {
          this.addNotice({ kind: 'external-change', docId: existing.id })
        }
        existing.handle = picked.handle
        this.activate(existing.id)
        return
      }
    }

    const now = Date.now()
    const doc: WorkspaceDoc = {
      id: createId(),
      title: result.title,
      workingText: text,
      savedText: text,
      savedVia: picked.handle ? 'file' : 'download',
      handle: picked.handle,
      fileName: picked.name,
      fileLastModified: picked.handle ? picked.lastModified : undefined,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    }
    this.docs.set(doc.id, doc)
    this.activate(doc.id)
  }

  // ---- saving ---------------------------------------------------------------

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.writeChain.then(task, task)
    this.writeChain = run.catch(() => {})
    return run
  }

  /** Save: write to the linked file, or ask where to save. */
  async save(): Promise<boolean> {
    this.flush()
    const doc = this.activeDoc()
    if (!doc) return false
    if (doc.handle) return this.writeToFile(doc, { interactive: true })
    return this.saveAs()
  }

  /** Save as: always ask for a new location (or download where unsupported). */
  async saveAs(): Promise<boolean> {
    this.flush()
    const doc = this.activeDoc()
    if (!doc) return false

    if (!supportsFileSystemAccess()) return this.downloadCopy(doc)

    let handle: FileSystemFileHandle | null
    try {
      handle = await pickSaveHandle(fileNameForTitle(doc.title), this.texts().nativeFileType)
    } catch (error) {
      // The API exists but the browser refuses it (embedded browsers, policies).
      console.warn('[wen2tu] save picker unavailable, downloading instead', error)
      return this.downloadCopy(doc)
    }
    if (!handle) return false

    // If another map was linked to this same file, it no longer is.
    for (const other of this.docs.values()) {
      if (other !== doc && other.handle && (await isSameFile(other.handle, handle))) {
        other.handle = undefined
        other.fileLastModified = undefined
        other.savedVia = undefined
        void this.saveRecord(other)
      }
    }

    doc.handle = handle
    doc.fileName = handle.name
    doc.title = titleFromFileName(handle.name)
    doc.fileLastModified = undefined
    return this.writeToFile(doc, { interactive: true, force: true, fallbackToDownload: true })
  }

  private downloadCopy(doc: WorkspaceDoc): boolean {
    const fileName = fileNameForTitle(doc.title)
    downloadText(doc.workingText, fileName, 'application/json')
    doc.savedText = doc.workingText
    doc.savedVia = 'download'
    doc.fileName = fileName
    void this.saveRecord(doc)
    this.addNotice({ kind: 'downloaded', fileName })
    return true
  }

  private async writeToFile(
    doc: WorkspaceDoc,
    {
      interactive,
      force = false,
      fallbackToDownload = false,
    }: { interactive: boolean; force?: boolean; fallbackToDownload?: boolean },
  ): Promise<boolean> {
    return this.enqueue(async () => {
      const handle = doc.handle
      if (!handle) return false
      this.savingDocId = doc.id
      this.emit()
      try {
        if (!(await ensurePermission(handle, 'readwrite', interactive))) {
          if (interactive) this.addNotice({ kind: 'error', message: { key: 'errors.permissionDenied' } })
          else this.permissionDocId = doc.id
          return false
        }
        if (!force && doc.fileLastModified !== undefined) {
          const onDisk = await getLastModified(handle)
          if (onDisk !== doc.fileLastModified) {
            if (interactive) this.conflictDocId = doc.id
            else this.addNotice({ kind: 'external-change', docId: doc.id })
            return false
          }
        }
        const text = doc.workingText
        doc.fileLastModified = await writeHandle(handle, text)
        doc.savedText = text
        doc.savedVia = 'file'
        if (this.failedDocId === doc.id) this.failedDocId = null
        if (this.permissionDocId === doc.id) this.permissionDocId = null
        await this.saveRecord(doc)
        return true
      } catch (error) {
        // A freshly picked file the browser then refuses to write (embedded
        // browsers, enterprise policies): unlink it and download instead.
        if (fallbackToDownload && isPlatformRefusal(error)) {
          console.warn('[wen2tu] writing refused, downloading instead', error)
          doc.handle = undefined
          doc.fileLastModified = undefined
          return this.downloadCopy(doc)
        }
        this.failedDocId = doc.id
        this.showError(error)
        return false
      } finally {
        this.savingDocId = null
        this.emit()
      }
    })
  }

  /** Resolves the "file changed on disk" dialog shown when saving. */
  async resolveConflict(choice: 'overwrite' | 'saveAs' | 'reload' | 'cancel') {
    const doc = this.conflictDocId ? this.docs.get(this.conflictDocId) : undefined
    this.conflictDocId = null
    this.emit()
    if (!doc) return
    if (choice === 'overwrite') await this.writeToFile(doc, { interactive: true, force: true })
    else if (choice === 'saveAs') await this.saveAs()
    else if (choice === 'reload') await this.reloadFromDisk(doc)
  }

  // ---- external changes -----------------------------------------------------

  /**
   * Checks whether the active map's file changed on disk. Runs without
   * prompting, so it only works while the browser still grants read access.
   */
  async checkExternalChange() {
    const doc = this.activeDoc()
    if (!doc?.handle || doc.fileLastModified === undefined || this.savingDocId) return
    try {
      if (!(await ensurePermission(doc.handle, 'read', false))) return
      const onDisk = await getLastModified(doc.handle)
      if (onDisk !== doc.fileLastModified && !this.savingDocId) {
        this.addNotice({ kind: 'external-change', docId: doc.id })
      }
    } catch {
      // File moved or deleted: reported when the user next saves.
    }
  }

  async resolveExternalChange(noticeId: string, choice: 'reload' | 'keep') {
    const notice = this.notices.find((n) => n.id === noticeId)
    this.dismissNotice(noticeId)
    if (!notice || notice.kind !== 'external-change') return
    const doc = this.docs.get(notice.docId)
    if (!doc?.handle) return

    if (choice === 'reload') return this.reloadFromDisk(doc)

    // Keep the local version: accept the new disk timestamp so the next save
    // overwrites it, and compare against what is on disk now.
    try {
      if (!(await ensurePermission(doc.handle, 'read', true))) return
      const { text, lastModified } = await readHandle(doc.handle)
      doc.fileLastModified = lastModified
      try {
        doc.savedText = serializeMap(parseDocument(text).map)
      } catch {
        doc.savedText = ''
      }
      void this.saveRecord(doc)
      this.emit()
    } catch (error) {
      this.showError(error)
    }
  }

  private async reloadFromDisk(doc: WorkspaceDoc) {
    if (!doc.handle) return
    try {
      if (!(await ensurePermission(doc.handle, 'read', true))) return
      const { text, lastModified } = await readHandle(doc.handle)
      const normalized = serializeMap(parseDocument(text).map)
      doc.workingText = doc.savedText = normalized
      doc.fileLastModified = lastModified
      doc.savedVia = 'file'
      void this.saveRecord(doc)
      if (doc.id === this.activeId) this.activate(doc.id)
      else this.emit()
    } catch (error) {
      this.showError(error)
    }
  }

  /** Throws away unsaved changes and returns to the last saved copy. */
  revertToSaved(docId: string) {
    const doc = this.docs.get(docId)
    if (!doc || doc.savedText === undefined) return
    this.notices = this.notices.filter((n) => !(n.kind === 'recovered' && n.docId === docId))
    doc.workingText = doc.savedText
    void this.saveRecord(doc)
    if (docId === this.activeId) this.activate(docId)
    else this.emit()
  }

  // ---- export ---------------------------------------------------------------

  /**
   * Exports a PNG or SVG. `transparent` leaves out the background and uses
   * the light version of dark color schemes, for pasting onto white pages.
   */
  async exportImage(format: ImageFormat, { transparent = false } = {}) {
    const doc = this.activeDoc()
    if (!doc || !this.canvas) return
    try {
      const blob = await this.canvas.withExportView({ light: transparent }, (target, background) =>
        exportImage(target, format, transparent ? null : background),
      )
      downloadBlob(blob, `${fileNameForTitle(doc.title).replace(/\.mind\.json$/, '')}.${format}`)
    } catch (error) {
      this.showError(error)
    }
  }

  exportMarkdown() {
    const doc = this.activeDoc()
    if (!doc || !this.canvas) return
    this.flush()
    const markdown = exportMarkdown(parseDocument(doc.workingText).map)
    downloadText(markdown, `${fileNameForTitle(doc.title).replace(/\.mind\.json$/, '')}.md`, 'text/markdown')
  }

  /** Whether leaving the page now could lose work that is not in a file yet. */
  shouldWarnBeforeUnload(): boolean {
    this.flush()
    const doc = this.activeDoc()
    return Boolean(doc?.handle && isDirty(doc))
  }
}
