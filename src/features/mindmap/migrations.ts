import { DocumentError } from './errors'
import { DOCUMENT_FORMAT, DOCUMENT_VERSION } from './types'

type RawDocument = Record<string, unknown> & { version: number }

/**
 * Upgrades functions keyed by the version they upgrade *from*. When the file
 * format changes, bump DOCUMENT_VERSION and add `[oldVersion]: (doc) => newDoc`.
 */
const MIGRATIONS: Record<number, (doc: RawDocument) => RawDocument> = {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Brings any supported input up to the current document version. Plain
 * Mind Elixir exports (`{ nodeData, ... }`) are accepted and wrapped.
 * The result still needs to be validated by the schema.
 */
export function migrateDocument(input: unknown): RawDocument {
  if (!isRecord(input)) throw new DocumentError('not-a-mindmap')

  if (input.format === undefined && 'nodeData' in input) {
    return { format: DOCUMENT_FORMAT, version: DOCUMENT_VERSION, map: input }
  }
  if (input.format !== DOCUMENT_FORMAT) throw new DocumentError('not-a-mindmap')

  const version = input.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new DocumentError('invalid-structure', 'version')
  }
  if (version > DOCUMENT_VERSION) {
    throw new DocumentError('unsupported-version', String(version))
  }

  let doc = input as RawDocument
  while (doc.version < DOCUMENT_VERSION) {
    const migrate = MIGRATIONS[doc.version]
    if (!migrate) throw new DocumentError('unsupported-version', String(doc.version))
    doc = migrate(doc)
  }
  return doc
}
