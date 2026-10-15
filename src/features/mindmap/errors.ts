export type DocumentErrorCode =
  | 'invalid-json'
  | 'not-a-mindmap'
  | 'unsupported-version'
  | 'invalid-structure'
  | 'too-large'
  | 'invalid-markdown'
  | 'invalid-opml'
  | 'unsupported-file'

/**
 * A problem with a file's content. `code` maps to a translated message;
 * `detail` is extra technical context (e.g. the path of a bad field).
 */
export class DocumentError extends Error {
  readonly code: DocumentErrorCode
  readonly detail?: string

  constructor(code: DocumentErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'DocumentError'
    this.code = code
    this.detail = detail
  }
}
