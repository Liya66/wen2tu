import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMap, parseDocument, serializeMap } from '../mindmap/document'
import type { MindMap } from '../mindmap/types'
import { WorkspaceController, type CanvasAdapter } from './workspaceController'
import { MemoryStore, openWorkspaceStore, type WorkspaceStore } from './workspaceStore'

const texts = () => ({
  untitled: 'Untitled map',
  rootTopic: 'Central topic',
  nativeFileType: 'map',
  importFileType: 'outline',
})

/** Stands in for Mind Elixir: holds a map and lets tests edit it. */
class FakeCanvas implements CanvasAdapter {
  map: MindMap = createMap('placeholder')
  getMap() {
    return structuredClone(this.map)
  }
  load(map: MindMap) {
    this.map = structuredClone(map)
    return this.getMap()
  }
  undo() {}
  redo() {}
  exportTarget() {
    return document.createElement('div')
  }
  backgroundColor() {
    return '#fff'
  }
  /** Simulates the user renaming the root node. */
  edit(topic: string) {
    this.map.nodeData.topic = topic
  }
}

/** In-memory File System Access file handle. */
class FakeHandle {
  readonly kind = 'file'
  name: string
  content: string
  lastModified = 1_000
  writes = 0
  permission: PermissionState = 'granted'

  constructor(name: string, content: string) {
    this.name = name
    this.content = content
  }
  async getFile() {
    return new File([this.content], this.name, { lastModified: this.lastModified })
  }
  async createWritable() {
    let buffer = ''
    return {
      write: async (text: string) => {
        buffer += text
      },
      close: async () => {
        this.content = buffer
        this.lastModified += 1_000
        this.writes++
      },
      abort: async () => {},
    }
  }
  async isSameEntry(other: unknown) {
    return other === this
  }
  async queryPermission() {
    return this.permission
  }
  async requestPermission() {
    return this.permission
  }
  /** Simulates another program changing the file. */
  externalWrite(content: string) {
    this.content = content
    this.lastModified += 5_000
  }
}

const asHandle = (handle: FakeHandle) => handle as unknown as FileSystemFileHandle

async function setup(store: WorkspaceStore = new MemoryStore()) {
  const controller = new WorkspaceController(texts, async () => store)
  const canvas = new FakeCanvas()
  controller.attachCanvas(canvas)
  await vi.waitFor(() => expect(controller.getState().ready).toBe(true))
  return { controller, canvas, store }
}

function nativeText(topic: string) {
  return serializeMap(createMap(topic))
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('WorkspaceController', () => {
  it('starts with a fresh draft', async () => {
    const { controller, canvas } = await setup()
    const state = controller.getState()
    expect(state.docs).toHaveLength(1)
    expect(state.active?.title).toBe('Untitled map')
    expect(state.active?.saveState).toBe('dirty')
    expect(state.active?.hasSavedCopy).toBe(false)
    expect(canvas.map.nodeData.topic).toBe('Central topic')
  })

  it('copies edits to browser storage and restores them after a restart', async () => {
    const store = new MemoryStore()
    const first = await setup(store)
    first.canvas.edit('Edited 编辑')
    first.controller.notifyChange()
    first.controller.flush()
    await vi.waitFor(async () => expect((await store.listDocs())[0].workingText).toContain('Edited 编辑'))

    const second = await setup(store)
    expect(second.canvas.map.nodeData.topic).toBe('Edited 编辑')
  })

  it('offers recovery when a saved file has newer unsaved edits', async () => {
    const store = new MemoryStore()
    const first = await setup(store)
    const handle = new FakeHandle('plan.mind.json', nativeText('Plan'))
    await first.controller.openPicked({ name: handle.name, text: handle.content, lastModified: handle.lastModified, handle: asHandle(handle) })
    first.canvas.edit('Plan v2')
    first.controller.notifyChange()
    first.controller.flush()
    await vi.runAllTimersAsync()

    const second = await setup(store)
    const notice = second.controller.getState().notices.find((n) => n.kind === 'recovered')
    expect(notice).toBeDefined()
    expect(second.canvas.map.nodeData.topic).toBe('Plan v2')

    second.controller.revertToSaved(second.controller.getState().active!.id)
    expect(second.canvas.map.nodeData.topic).toBe('Plan')
    expect(second.controller.getState().active?.saveState).toBe('saved')
  })

  it('keeps the current map when an invalid file is opened', async () => {
    const { controller, canvas } = await setup()
    canvas.edit('Precious work')
    controller.notifyChange()
    await controller.openPicked({ name: 'broken.mind.json', text: '{"format":"wen2tu"', lastModified: 0 })
    expect(canvas.map.nodeData.topic).toBe('Precious work')
    expect(controller.getState().docs).toHaveLength(1)
    const error = controller.getState().notices.find((n) => n.kind === 'error')
    expect(error && 'message' in error && error.message.key).toBe('errors.invalid-json')
  })

  it('imports Markdown as a new unsaved map without linking the source file', async () => {
    const { controller, canvas } = await setup()
    await controller.openPicked({ name: 'notes.md', text: '# Notes\n- a', lastModified: 0 })
    const state = controller.getState()
    expect(state.docs).toHaveLength(2)
    expect(state.active).toMatchObject({ title: 'notes', linked: false, hasSavedCopy: false })
    expect(canvas.map.nodeData.topic).toBe('Notes')
    expect(state.notices.some((n) => n.kind === 'imported')).toBe(true)
  })

  it('saves to the linked file and tracks the saved state', async () => {
    const { controller, canvas } = await setup()
    const handle = new FakeHandle('plan.mind.json', nativeText('Plan'))
    await controller.openPicked({ name: handle.name, text: handle.content, lastModified: handle.lastModified, handle: asHandle(handle) })
    expect(controller.getState().active).toMatchObject({ linked: true, saveState: 'saved', title: 'plan' })

    canvas.edit('Plan 🐰')
    controller.notifyChange()
    expect(controller.getState().active?.saveState).toBe('dirty')

    await expect(controller.save()).resolves.toBe(true)
    expect(handle.writes).toBe(1)
    expect(parseDocument(handle.content).map.nodeData.topic).toBe('Plan 🐰')
    expect(controller.getState().active?.saveState).toBe('saved')
  })

  it('does not overwrite a file that changed on disk without asking', async () => {
    const { controller, canvas } = await setup()
    const handle = new FakeHandle('plan.mind.json', nativeText('Plan'))
    await controller.openPicked({ name: handle.name, text: handle.content, lastModified: handle.lastModified, handle: asHandle(handle) })
    handle.externalWrite(nativeText('Changed elsewhere'))

    canvas.edit('Mine')
    controller.notifyChange()
    await expect(controller.save()).resolves.toBe(false)
    expect(handle.writes).toBe(0)
    expect(controller.getState().conflictDocId).toBe(controller.getState().active?.id)

    await controller.resolveConflict('overwrite')
    expect(handle.writes).toBe(1)
    expect(parseDocument(handle.content).map.nodeData.topic).toBe('Mine')
  })

  it('detects external changes and can reload them', async () => {
    const { controller, canvas } = await setup()
    const handle = new FakeHandle('plan.mind.json', nativeText('Plan'))
    await controller.openPicked({ name: handle.name, text: handle.content, lastModified: handle.lastModified, handle: asHandle(handle) })
    handle.externalWrite(nativeText('From another app'))

    await controller.checkExternalChange()
    const notice = controller.getState().notices.find((n) => n.kind === 'external-change')!
    expect(notice).toBeDefined()
    await controller.resolveExternalChange(notice.id, 'reload')
    expect(canvas.map.nodeData.topic).toBe('From another app')
    expect(controller.getState().active?.saveState).toBe('saved')
  })

  it('reports a failed write and keeps the edits', async () => {
    const { controller, canvas } = await setup()
    const handle = new FakeHandle('plan.mind.json', nativeText('Plan'))
    await controller.openPicked({ name: handle.name, text: handle.content, lastModified: handle.lastModified, handle: asHandle(handle) })
    handle.createWritable = async () => {
      throw new DOMException('disk full', 'QuotaExceededError')
    }
    canvas.edit('Unsaved but safe')
    controller.notifyChange()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(controller.save()).resolves.toBe(false)
    expect(controller.getState().active?.saveState).toBe('error')
    expect(canvas.map.nodeData.topic).toBe('Unsaved but safe')
  })

  it('serializes rapid saves so writes never overlap', async () => {
    const { controller, canvas } = await setup()
    const handle = new FakeHandle('plan.mind.json', nativeText('Plan'))
    await controller.openPicked({ name: handle.name, text: handle.content, lastModified: handle.lastModified, handle: asHandle(handle) })

    let active = 0
    let maxActive = 0
    const original = handle.createWritable.bind(handle)
    handle.createWritable = async () => {
      const writable = await original()
      active++
      maxActive = Math.max(maxActive, active)
      return {
        ...writable,
        close: async () => {
          await new Promise((resolve) => setTimeout(resolve, 5))
          await writable.close()
          active--
        },
      }
    }

    const saves = []
    for (let i = 0; i < 5; i++) {
      canvas.edit(`v${i}`)
      controller.notifyChange()
      saves.push(controller.save())
    }
    await vi.runAllTimersAsync()
    await Promise.all(saves)
    expect(maxActive).toBe(1)
    expect(parseDocument(handle.content).map.nodeData.topic).toBe('v4')
  })

  it('re-activates an already open file instead of duplicating it', async () => {
    const { controller } = await setup()
    const handle = new FakeHandle('plan.mind.json', nativeText('Plan'))
    const picked = { name: handle.name, text: handle.content, lastModified: handle.lastModified, handle: asHandle(handle) }
    await controller.openPicked(picked)
    controller.newDoc()
    await controller.openPicked(picked)
    expect(controller.getState().docs).toHaveLength(3)
    expect(controller.getState().active?.title).toBe('plan')
  })

  it('removes maps and always keeps one open', async () => {
    const { controller } = await setup()
    const only = controller.getState().active!.id
    await controller.removeDoc(only)
    const state = controller.getState()
    expect(state.docs).toHaveLength(1)
    expect(state.active?.id).not.toBe(only)
  })

  it('renames drafts but not linked maps', async () => {
    const { controller } = await setup()
    const id = controller.getState().active!.id
    controller.renameDoc(id, '  学习计划  ')
    expect(controller.getState().active?.title).toBe('学习计划')
  })

  it('works with the IndexedDB store', async () => {
    const store = await openWorkspaceStore()
    expect(store.persistent).toBe(true)
    const { controller } = await setup(store)
    controller.newDoc()
    await vi.runAllTimersAsync()
    expect((await store.listDocs()).length).toBeGreaterThanOrEqual(2)
  })
})
