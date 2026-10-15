/**
 * Direct access to files on disk via the File System Access API
 * (Chromium-based browsers: Chrome, Edge, Opera, Brave, Arc…).
 */

export function supportsFileSystemAccess(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.showOpenFilePicker === 'function' &&
    typeof window.showSaveFilePicker === 'function'
  )
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export interface PickedFile {
  name: string
  text: string
  lastModified: number
  handle?: FileSystemFileHandle
}

/** Opens the system file picker. Returns null if the user cancels. */
export async function pickFileWithHandle(
  description: string,
  accept: Record<string, string[]>,
): Promise<PickedFile | null> {
  let handles: FileSystemFileHandle[]
  try {
    handles = await window.showOpenFilePicker!({
      id: 'wen2tu-open',
      types: [{ description, accept }],
    })
  } catch (error) {
    if (isAbortError(error)) return null
    throw error
  }
  const handle = handles[0]
  const file = await handle.getFile()
  return { name: file.name, text: await file.text(), lastModified: file.lastModified, handle }
}

/** Asks where to save. Returns null if the user cancels. */
export async function pickSaveHandle(
  suggestedName: string,
  description: string,
): Promise<FileSystemFileHandle | null> {
  try {
    return await window.showSaveFilePicker!({
      id: 'wen2tu-save',
      suggestedName,
      types: [{ description, accept: { 'application/json': ['.json'] } }],
    })
  } catch (error) {
    if (isAbortError(error)) return null
    throw error
  }
}

/**
 * Checks (and optionally requests) permission to use a stored handle.
 * Requesting must happen during a user gesture such as a click or keypress.
 */
export async function ensurePermission(
  handle: FileSystemFileHandle,
  mode: 'read' | 'readwrite',
  request: boolean,
): Promise<boolean> {
  if (!handle.queryPermission) return true
  if ((await handle.queryPermission({ mode })) === 'granted') return true
  if (!request || !handle.requestPermission) return false
  return (await handle.requestPermission({ mode })) === 'granted'
}

export async function readHandle(handle: FileSystemFileHandle): Promise<{ text: string; lastModified: number }> {
  const file = await handle.getFile()
  return { text: await file.text(), lastModified: file.lastModified }
}

export async function getLastModified(handle: FileSystemFileHandle): Promise<number> {
  return (await handle.getFile()).lastModified
}

/** Writes the text and returns the file's new modification time. */
export async function writeHandle(handle: FileSystemFileHandle, text: string): Promise<number> {
  const writable = await handle.createWritable()
  try {
    await writable.write(text)
    await writable.close()
  } catch (error) {
    // Leave the original file untouched if anything failed mid-write.
    await writable.abort().catch(() => {})
    throw error
  }
  return getLastModified(handle)
}

export async function isSameFile(a: FileSystemFileHandle, b: FileSystemFileHandle): Promise<boolean> {
  try {
    return await a.isSameEntry(b)
  } catch {
    return false
  }
}
