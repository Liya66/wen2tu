import { parseDocument, titleFromFileName } from '../mindmap/document'
import { DocumentError } from '../mindmap/errors'
import type { MindMap } from '../mindmap/types'

export type SourceKind = 'native' | 'markdown' | 'opml' | 'html'

/** Every file type wen2tu can open: its own maps plus importable outlines. */
export const SUPPORTED_ACCEPT: Record<string, string[]> = {
  'application/json': ['.json'],
  'text/markdown': ['.md', '.markdown'],
  'text/plain': ['.txt'],
  'text/x-opml': ['.opml'],
  'application/xml': ['.xml'],
  'text/html': ['.html', '.htm'],
}
export const SUPPORTED_EXTENSIONS = Object.values(SUPPORTED_ACCEPT).flat()

export function detectKind(fileName: string): SourceKind | null {
  const name = fileName.toLowerCase()
  if (name.endsWith('.json')) return 'native'
  if (/\.(md|markdown|txt)$/.test(name)) return 'markdown'
  if (/\.(opml|xml)$/.test(name)) return 'opml'
  if (/\.html?$/.test(name)) return 'html'
  return null
}

export interface ReadResult {
  kind: SourceKind
  title: string
  map: MindMap
}

/**
 * Turns file contents into a validated map. Throws DocumentError for any
 * problem, so callers can keep the current document untouched on failure.
 * Importers are loaded on demand to keep the initial bundle small.
 */
export async function readSource(fileName: string, text: string): Promise<ReadResult> {
  const kind = detectKind(fileName)
  const title = titleFromFileName(fileName)
  switch (kind) {
    case 'native':
      return { kind, title, map: parseDocument(text).map }
    case 'markdown': {
      const { importMarkdown } = await import('./markdownImport')
      return { kind, title, map: importMarkdown(text, title) }
    }
    case 'opml': {
      const { importOpml } = await import('./opmlImport')
      return { kind, title, map: importOpml(text, title) }
    }
    case 'html': {
      // A map exported by wen2tu carries its data; any other page has none.
      const { extractHtmlData } = await import('./htmlExport')
      const data = extractHtmlData(text)
      if (!data) throw new DocumentError('unsupported-file', fileName)
      return { kind, title, map: parseDocument(data).map }
    }
    default:
      throw new DocumentError('unsupported-file', fileName)
  }
}
