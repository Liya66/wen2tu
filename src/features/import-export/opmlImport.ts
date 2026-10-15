import { createNode } from '../mindmap/document'
import { DocumentError } from '../mindmap/errors'
import { safeLinkUrl } from '../mindmap/sanitize'
import { LIMITS, sanitizeMap } from '../mindmap/schema'
import type { MapNode, MindMap } from '../mindmap/types'

/**
 * Converts an OPML outline into a mind map. Each `<outline>` becomes a node:
 * `text` (or `title`) is the topic, `_note` the note, and `url` / `htmlUrl`
 * the link. A body with a single top-level outline uses it as the root.
 */
export function importOpml(text: string, fallbackTitle: string): MindMap {
  if (text.length > LIMITS.maxFileBytes) throw new DocumentError('too-large')
  // Entity declarations are never needed in OPML and are the vector for
  // entity-expansion attacks, so refuse them outright.
  if (/<!ENTITY/i.test(text)) throw new DocumentError('invalid-opml', 'ENTITY declarations are not allowed')

  const xml = new DOMParser().parseFromString(text, 'application/xml')
  if (xml.getElementsByTagName('parsererror').length) throw new DocumentError('invalid-opml', 'XML parse error')
  const opml = xml.documentElement
  if (opml.nodeName.toLowerCase() !== 'opml') throw new DocumentError('invalid-opml', 'missing <opml>')

  const body = childElements(opml, 'body')[0]
  if (!body) throw new DocumentError('invalid-opml', 'missing <body>')
  const head = childElements(opml, 'head')[0]
  const title = head ? childElements(head, 'title')[0]?.textContent?.trim() : undefined

  const budget = { nodes: 0 }
  const outlines = childElements(body, 'outline')
  let root: MapNode
  if (outlines.length === 1) {
    root = outlineToNode(outlines[0], budget, 0)
  } else {
    root = createNode(title || fallbackTitle)
    const children = outlines.map((o) => outlineToNode(o, budget, 1))
    if (children.length) root.children = children
  }

  return sanitizeMap({ nodeData: root, direction: 2 })
}

function childElements(parent: Element, name: string): Element[] {
  return Array.from(parent.children).filter((el) => el.nodeName.toLowerCase() === name)
}

function outlineToNode(outline: Element, budget: { nodes: number }, depth: number): MapNode {
  if (depth > LIMITS.maxDepth) throw new DocumentError('too-large')
  if (++budget.nodes > LIMITS.maxNodes) throw new DocumentError('too-large')

  const topic = outline.getAttribute('text') ?? outline.getAttribute('title') ?? ''
  const node = createNode(topic)
  const note = outline.getAttribute('_note')
  if (note) node.note = note
  const link = safeLinkUrl(outline.getAttribute('url') ?? outline.getAttribute('htmlUrl') ?? undefined)
  if (link) node.hyperLink = link

  const children = childElements(outline, 'outline').map((child) => outlineToNode(child, budget, depth + 1))
  if (children.length) node.children = children
  return node
}
