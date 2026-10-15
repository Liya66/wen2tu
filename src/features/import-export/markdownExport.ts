import type { MapNode, MindMap } from '../mindmap/types'

function inline(node: MapNode): string {
  const text = node.topic.replace(/\s*\n\s*/g, ' ').trim()
  if (!node.hyperLink) return text
  const label = text.replace(/[[\]]/g, '\\$&')
  return `[${label}](${node.hyperLink.replace(/[()\s]/g, encodeURIComponent)})`
}

/**
 * Exports the map as a Markdown outline: the root becomes a `#` heading and
 * every other node a nested bullet. Importing the result rebuilds the same tree.
 */
export function exportMarkdown(map: MindMap): string {
  const lines = [`# ${inline(map.nodeData)}`, '']
  const stack: Array<{ node: MapNode; depth: number }> = []
  const top = map.nodeData.children ?? []
  for (let i = top.length - 1; i >= 0; i--) stack.push({ node: top[i], depth: 0 })

  while (stack.length) {
    const { node, depth } = stack.pop()!
    lines.push(`${'  '.repeat(depth)}- ${inline(node)}`)
    const children = node.children ?? []
    for (let i = children.length - 1; i >= 0; i--) stack.push({ node: children[i], depth: depth + 1 })
  }
  return lines.join('\n').trimEnd() + '\n'
}
