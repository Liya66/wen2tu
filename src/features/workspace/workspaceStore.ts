import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

/**
 * One map in the workspace. The browser keeps the latest working copy of
 * every map (this is what makes crash recovery possible); `savedText` is the
 * content last written to or read from a real file, so the two can be
 * compared to tell whether there are unsaved changes.
 */
export interface WorkspaceDoc {
  id: string
  title: string
  /** Serialized current content, updated continuously while editing. */
  workingText: string
  /** Serialized content last known to match a file the user has. */
  savedText?: string
  /** How `savedText` reached the user: written to a linked file, or downloaded. */
  savedVia?: 'file' | 'download'
  /** Linked file on disk (Chromium only). */
  handle?: FileSystemFileHandle
  fileName?: string
  /** Modification time of the linked file when we last read or wrote it. */
  fileLastModified?: number
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
}

export interface WorkspaceStore {
  /** False when IndexedDB is unavailable and data only lives in memory. */
  readonly persistent: boolean
  listDocs(): Promise<WorkspaceDoc[]>
  getDoc(id: string): Promise<WorkspaceDoc | undefined>
  putDoc(doc: WorkspaceDoc): Promise<void>
  deleteDoc(id: string): Promise<void>
  getSetting<T>(key: string): Promise<T | undefined>
  setSetting<T>(key: string, value: T): Promise<void>
}

interface Wen2tuDB extends DBSchema {
  documents: { key: string; value: WorkspaceDoc }
  settings: { key: string; value: unknown }
}

const DB_NAME = 'wen2tu'
const DB_VERSION = 1

class IndexedDbStore implements WorkspaceStore {
  readonly persistent = true
  private readonly db: IDBPDatabase<Wen2tuDB>

  constructor(db: IDBPDatabase<Wen2tuDB>) {
    this.db = db
  }

  listDocs() {
    return this.db.getAll('documents')
  }
  getDoc(id: string) {
    return this.db.get('documents', id)
  }
  async putDoc(doc: WorkspaceDoc) {
    try {
      await this.db.put('documents', doc)
    } catch (error) {
      // Some browsers cannot store file handles; keep the content regardless.
      if (doc.handle && error instanceof DOMException && error.name === 'DataCloneError') {
        await this.db.put('documents', { ...doc, handle: undefined })
      } else {
        throw error
      }
    }
  }
  async deleteDoc(id: string) {
    await this.db.delete('documents', id)
  }
  async getSetting<T>(key: string) {
    return (await this.db.get('settings', key)) as T | undefined
  }
  async setSetting<T>(key: string, value: T) {
    await this.db.put('settings', value, key)
  }
}

export class MemoryStore implements WorkspaceStore {
  readonly persistent = false
  private docs = new Map<string, WorkspaceDoc>()
  private settings = new Map<string, unknown>()

  async listDocs() {
    return [...this.docs.values()].map((d) => ({ ...d }))
  }
  async getDoc(id: string) {
    const doc = this.docs.get(id)
    return doc && { ...doc }
  }
  async putDoc(doc: WorkspaceDoc) {
    this.docs.set(doc.id, { ...doc })
  }
  async deleteDoc(id: string) {
    this.docs.delete(id)
  }
  async getSetting<T>(key: string) {
    return this.settings.get(key) as T | undefined
  }
  async setSetting<T>(key: string, value: T) {
    this.settings.set(key, value)
  }
}

/**
 * Opens the IndexedDB-backed store, falling back to memory if IndexedDB is
 * unavailable (e.g. some private browsing modes). The app keeps working
 * either way; only crash recovery is lost.
 */
export async function openWorkspaceStore(): Promise<WorkspaceStore> {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB unavailable')
    const db = await openDB<Wen2tuDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        database.createObjectStore('documents', { keyPath: 'id' })
        database.createObjectStore('settings')
      },
    })
    return new IndexedDbStore(db)
  } catch (error) {
    console.warn('[wen2tu] IndexedDB unavailable, using in-memory storage', error)
    return new MemoryStore()
  }
}
