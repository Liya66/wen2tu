import { createId } from '../../utils/id'
import { DocumentError } from './errors'
import { migrateDocument } from './migrations'
import { LIMITS, sanitizeMap } from './schema'
import {
  DOCUMENT_FORMAT,
  DOCUMENT_VERSION,
  NATIVE_EXTENSION,
  type MapNode,
  type MindDocument,
  type MindMap,
} from './types'

export const SIDE: MindMap['direction'] = 2

export function createNode(topic: string, children?: MapNode[]): MapNode {
  const node: MapNode = { id: createId(), topic }
  if (children?.length) node.children = children
  return node
}

export function createMap(rootTopic: string): MindMap {
  return { nodeData: createNode(rootTopic), direction: SIDE }
}

export function createDocument(map: MindMap): MindDocument {
  return { format: DOCUMENT_FORMAT, version: DOCUMENT_VERSION, map }
}

/** Parses untrusted text into a validated, sanitized document. */
export function parseDocument(text: string): MindDocument {
  if (text.length > LIMITS.maxFileBytes) throw new DocumentError('too-large')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new DocumentError('invalid-json', error instanceof Error ? error.message : undefined)
  }
  const migrated = migrateDocument(raw)
  const map = sanitizeMap(migrated.map)
  const doc = createDocument(map)
  const title = (migrated.meta as { title?: unknown } | undefined)?.title
  if (typeof title === 'string' && title.trim()) doc.meta = { title: title.slice(0, 200) }
  return doc
}

/** Stable, human-readable serialization of a document. */
export function serializeDocument(doc: MindDocument): string {
  return JSON.stringify(doc, null, 2) + '\n'
}

export function serializeMap(map: MindMap): string {
  return serializeDocument(createDocument(map))
}

/**
 * Converts the object returned by Mind Elixir's `getData()` into the app's
 * map model, dropping runtime-only fields such as `theme`, `parent` links and
 * any unknown properties.
 */
export function fromEngineData(data: unknown): MindMap {
  return sanitizeMap(data)
}

/** "notes.mind.json" -> "notes", "plan.md" -> "plan". */
export function titleFromFileName(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith(NATIVE_EXTENSION)) return name.slice(0, -NATIVE_EXTENSION.length)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

/** Turns a title into a safe file name with the native extension. */
export function fileNameForTitle(title: string): string {
  // Characters that are invalid in file names on Windows/macOS, plus control characters.
  // oxlint-disable-next-line no-control-regex
  const base = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 120) || 'mindmap'
  return base + NATIVE_EXTENSION
}
