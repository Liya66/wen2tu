import { createNode } from '../mindmap/document'
import { DocumentError } from '../mindmap/errors'
import { LIMITS, sanitizeMap } from '../mindmap/schema'
import type { MapNode, MindMap } from '../mindmap/types'

/** Unwraps text that is a single fenced code block (as copied from an AI chat). */
export function stripCodeFence(text: string): string {
  const match = text.trim().match(/^(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n\1\s*$/)
  return match ? match[2] : text
}

const MARKDOWN_LINE = /^\s{0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s)/

/** True if the text uses Markdown headings or list markers. */
export function looksLikeMarkdown(text: string): boolean {
  return text.split('\n').some((line) => MARKDOWN_LINE.test(line))
}

/** True if pasted text is worth turning into a map: several lines, or Markdown structure. */
export function looksLikeOutline(text: string): boolean {
  const lines = stripCodeFence(text)
    .split('\n')
    .filter((line) => line.trim())
  return lines.length >= 2 || (lines.length === 1 && /^\s*#{1,6}\s/.test(lines[0]))
}

// Bullet characters used by notes apps and outliners that aren't Markdown.
const PLAIN_BULLET = /^[•◦▪▫‣·●○■□–—]\s*/

/**
 * Plain indented text (tabs or spaces) → topics. Each line is a topic; a
 * line indented deeper than the one above becomes its child.
 */
export function parseIndentedOutline(text: string): MapNode[] {
  const top: MapNode[] = []
  const stack: Array<{ indent: number; node: MapNode }> = []
  let count = 0
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue
    if (++count > LIMITS.maxNodes) throw new DocumentError('too-large')
    const leading = raw.match(/^[\t ]*/)![0]
    // A tab counts as four spaces, so mixed indentation still nests sensibly.
    const indent = leading.replace(/\t/g, '    ').length
    const node = createNode(raw.trim().replace(PLAIN_BULLET, ''))
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    const parent = stack[stack.length - 1]?.node
    if (parent) (parent.children ??= []).push(node)
    else top.push(node)
    stack.push({ indent, node })
  }
  return top
}

const SYNTHETIC_ROOT = '\u0000'

/**
 * Turns pasted text into a list of top-level topics (with their subtopics).
 * Markdown is parsed with the Markdown importer; anything else by indentation.
 */
export async function parseOutline(text: string): Promise<MapNode[]> {
  if (text.length > LIMITS.maxFileBytes) throw new DocumentError('too-large')
  const body = stripCodeFence(text).replace(/\r\n?/g, '\n')
  let nodes: MapNode[]
  if (looksLikeMarkdown(body)) {
    const { importMarkdown } = await import('./markdownImport')
    const root = importMarkdown(body, SYNTHETIC_ROOT).nodeData
    nodes = root.topic === SYNTHETIC_ROOT ? (root.children ?? []) : [root]
  } else {
    nodes = parseIndentedOutline(body)
  }
  // Validate and sanitize the same way as a file (ids, limits, unsafe fields).
  const checked = sanitizeMap({ nodeData: { id: 'r', topic: '', children: nodes } }).nodeData
  return checked.children ?? []
}

/** Builds a whole map from pasted text; a single top-level topic becomes the center. */
export async function outlineToMap(text: string, fallbackTitle: string): Promise<{ map: MindMap; title: string }> {
  const nodes = await parseOutline(text)
  if (!nodes.length) throw new DocumentError('invalid-markdown', 'empty')
  const root = nodes.length === 1 ? nodes[0] : createNode(fallbackTitle, nodes)
  const map = sanitizeMap({ nodeData: root, direction: 2 })
  const title = map.nodeData.topic.replace(/\s+/g, ' ').trim().slice(0, 60) || fallbackTitle
  return { map, title }
}
