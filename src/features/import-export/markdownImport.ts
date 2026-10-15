import type { List, ListItem, Paragraph, PhrasingContent, Root, RootContent } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { createNode } from '../mindmap/document'
import { DocumentError } from '../mindmap/errors'
import { safeLinkUrl } from '../mindmap/sanitize'
import { LIMITS, sanitizeMap } from '../mindmap/schema'
import type { MapNode, MindMap } from '../mindmap/types'

/**
 * Converts Markdown into a mind map.
 *
 * Supported structure:
 * - Headings build the hierarchy (a single leading `#` heading becomes the root).
 * - Bullet and numbered lists (nested to any depth) become child nodes.
 * - Task list items (GitHub Flavored Markdown) get a ✅ / ⬜ icon.
 * - Paragraphs become nodes under the nearest heading or list item.
 * - A list item or paragraph that is a single link keeps the URL as the node's link.
 *
 * Code blocks, tables, block quotes, raw HTML and images are skipped.
 */
export function importMarkdown(text: string, fallbackTitle: string): MindMap {
  if (text.length > LIMITS.maxFileBytes) throw new DocumentError('too-large')

  let tree: Root
  try {
    const processor = unified().use(remarkParse).use(remarkGfm)
    tree = processor.runSync(processor.parse(text)) as Root
  } catch (error) {
    throw new DocumentError('invalid-markdown', error instanceof Error ? error.message : undefined)
  }

  const budget = { nodes: 0 }
  const blocks = tree.children
  const h1Count = blocks.filter((b) => b.type === 'heading' && b.depth === 1).length
  const first = blocks.find((b) => b.type !== 'html' && b.type !== 'definition')
  const rootHeading = h1Count === 1 && first?.type === 'heading' && first.depth === 1 ? first : null

  const root = createNode(rootHeading ? phrasingText(rootHeading.children) : fallbackTitle)
  const stack: Array<{ level: number; node: MapNode }> = [{ level: rootHeading ? 1 : 0, node: root }]

  for (const block of blocks) {
    if (block === rootHeading) continue
    if (block.type === 'heading') {
      while (stack.length > 1 && stack[stack.length - 1].level >= block.depth) stack.pop()
      const node = makeNode(phrasingText(block.children), budget)
      addChild(stack[stack.length - 1].node, node)
      stack.push({ level: block.depth, node })
      continue
    }
    for (const node of blockToNodes(block, budget, 0)) addChild(stack[stack.length - 1].node, node)
  }

  return sanitizeMap({ nodeData: root, direction: 2 })
}

function makeNode(topic: string, budget: { nodes: number }): MapNode {
  if (++budget.nodes > LIMITS.maxNodes) throw new DocumentError('too-large')
  return createNode(topic)
}

function addChild(parent: MapNode, child: MapNode) {
  ;(parent.children ??= []).push(child)
}

function blockToNodes(block: RootContent, budget: { nodes: number }, depth: number): MapNode[] {
  if (depth > LIMITS.maxDepth) throw new DocumentError('too-large')
  if (block.type === 'list') return listToNodes(block, budget, depth)
  if (block.type === 'paragraph') {
    const node = paragraphNode(block, budget)
    return node ? [node] : []
  }
  return []
}

function listToNodes(list: List, budget: { nodes: number }, depth: number): MapNode[] {
  return list.children.map((item) => listItemNode(item, budget, depth))
}

function listItemNode(item: ListItem, budget: { nodes: number }, depth: number): MapNode {
  const [head, ...rest] = item.children
  let node: MapNode
  let remaining = rest
  if (head?.type === 'paragraph') {
    node = paragraphNode(head, budget) ?? makeNode('', budget)
  } else {
    node = makeNode('', budget)
    remaining = item.children
  }
  if (item.checked === true || item.checked === false) node.icons = [item.checked ? '✅' : '⬜']
  for (const child of remaining) {
    for (const sub of blockToNodes(child, budget, depth + 1)) addChild(node, sub)
  }
  return node
}

function paragraphNode(paragraph: Paragraph, budget: { nodes: number }): MapNode | null {
  const topic = phrasingText(paragraph.children).trim()
  if (!topic) return null
  const node = makeNode(topic, budget)
  const meaningful = paragraph.children.filter((c) => !(c.type === 'text' && !c.value.trim()))
  if (meaningful.length === 1 && meaningful[0].type === 'link') {
    const url = safeLinkUrl(meaningful[0].url)
    if (url) node.hyperLink = url
  }
  return node
}

function phrasingText(nodes: PhrasingContent[]): string {
  let out = ''
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
      case 'inlineCode':
        out += node.value
        break
      case 'break':
        out += '\n'
        break
      case 'image':
        out += node.alt ?? ''
        break
      case 'strong':
      case 'emphasis':
      case 'delete':
      case 'link':
        out += phrasingText(node.children)
        break
      default:
        break
    }
  }
  return out.replace(/[ \t]+\n/g, '\n').trim()
}
