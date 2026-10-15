import { z } from 'zod'
import { createId } from '../../utils/id'
import { DocumentError } from './errors'
import { safeCssValue, safeImageUrl, safeLinkUrl } from './sanitize'
import {
  NODE_STYLE_KEYS,
  type MapArrow,
  type MapNode,
  type MapSummary,
  type MindMap,
} from './types'

export const LIMITS = {
  maxNodes: 50_000,
  maxDepth: 500,
  maxTopicLength: 20_000,
  maxFileBytes: 20 * 1024 * 1024,
}

const styleValue = z.union([z.string(), z.number()])

/**
 * Fields of a single node. Children are validated by the tree walk below
 * rather than by a recursive schema, so depth and size limits can be enforced
 * without risking a stack overflow. Unknown keys (including Mind Elixir's
 * `dangerouslySetInnerHTML`) are dropped.
 */
const nodeFieldsSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  topic: z.union([z.string(), z.number()]).default(''),
  children: z.array(z.unknown()).optional(),
  expanded: z.boolean().optional(),
  direction: z.union([z.literal(0), z.literal(1)]).optional(),
  style: z.record(z.string(), styleValue).optional(),
  tags: z.array(z.union([z.string(), z.object({ text: z.string() })])).optional(),
  icons: z.array(z.string()).optional(),
  hyperLink: z.string().optional(),
  note: z.string().optional(),
  branchColor: z.string().optional(),
  image: z
    .object({
      url: z.string(),
      width: z.number().positive(),
      height: z.number().positive(),
      fit: z.enum(['fill', 'contain', 'cover']).optional(),
    })
    .optional(),
})

const point = z.object({ x: z.number(), y: z.number() })

const arrowSchema = z.object({
  id: z.string().min(1),
  label: z.string().default(''),
  from: z.string(),
  to: z.string(),
  delta1: point.optional(),
  delta2: point.optional(),
  bidirectional: z.boolean().optional(),
  style: z
    .object({
      stroke: z.string().optional(),
      strokeWidth: z.union([z.string(), z.number()]).optional(),
      strokeDasharray: z.string().optional(),
      opacity: z.union([z.string(), z.number()]).optional(),
      labelColor: z.string().optional(),
    })
    .optional(),
})

const summarySchema = z.object({
  id: z.string().min(1),
  label: z.string().default(''),
  parent: z.string(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  style: z
    .object({ stroke: z.string().optional(), labelColor: z.string().optional() })
    .optional(),
})

const mapSchema = z.object({
  nodeData: z.unknown(),
  arrows: z.array(z.unknown()).optional(),
  summaries: z.array(z.unknown()).optional(),
  direction: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  compact: z.boolean().optional(),
})

function describeIssue(error: z.ZodError, prefix: string): string {
  const issue = error.issues[0]
  const path = [prefix, ...issue.path.map(String)].filter(Boolean).join('.')
  return `${path}: ${issue.message}`
}

function cleanStyle(style: Record<string, string | number> | undefined) {
  if (!style) return undefined
  const result: MapNode['style'] = {}
  for (const key of NODE_STYLE_KEYS) {
    const raw = style[key]
    if (raw === undefined) continue
    const value = safeCssValue(String(raw))
    if (value !== undefined) result[key] = value
  }
  return Object.keys(result).length ? result : undefined
}

function cleanColor(value: string | undefined): string | undefined {
  return value === undefined ? undefined : safeCssValue(value)
}

/**
 * Validates and sanitizes an untrusted node tree. Returns a fresh tree that
 * only contains known, safe fields.
 */
export function sanitizeNodeTree(input: unknown): MapNode {
  const seenIds = new Set<string>()
  let count = 0

  // Iterative walk: each entry pairs an untrusted node with the array its
  // sanitized copy should be pushed into.
  const rootHolder: MapNode[] = []
  const stack: Array<{ raw: unknown; into: MapNode[]; depth: number; path: string }> = [
    { raw: input, into: rootHolder, depth: 0, path: 'nodeData' },
  ]

  while (stack.length) {
    const { raw, into, depth, path } = stack.pop()!
    if (depth > LIMITS.maxDepth) throw new DocumentError('too-large', `depth > ${LIMITS.maxDepth}`)
    if (++count > LIMITS.maxNodes) throw new DocumentError('too-large', `nodes > ${LIMITS.maxNodes}`)

    const parsed = nodeFieldsSchema.safeParse(raw)
    if (!parsed.success) throw new DocumentError('invalid-structure', describeIssue(parsed.error, path))
    const fields = parsed.data

    let id = fields.id === undefined ? '' : String(fields.id)
    if (!id || seenIds.has(id) || id.length > 100) id = createId()
    seenIds.add(id)

    const topic = String(fields.topic)
    if (topic.length > LIMITS.maxTopicLength) {
      throw new DocumentError('too-large', `${path}.topic`)
    }

    const node: MapNode = { id, topic }
    if (fields.expanded === false) node.expanded = false
    if (fields.direction !== undefined && depth === 1) node.direction = fields.direction
    const style = cleanStyle(fields.style)
    if (style) node.style = style
    const tags = fields.tags?.map((tag) => (typeof tag === 'string' ? tag : tag.text))
    if (tags?.length) node.tags = tags
    if (fields.icons?.length) node.icons = fields.icons
    const link = safeLinkUrl(fields.hyperLink)
    if (link) node.hyperLink = link
    if (fields.note) node.note = fields.note
    const branchColor = cleanColor(fields.branchColor)
    if (branchColor) node.branchColor = branchColor
    if (fields.image) {
      const url = safeImageUrl(fields.image.url)
      if (url) node.image = { ...fields.image, url }
    }

    into.push(node)

    if (fields.children?.length) {
      node.children = []
      // Push in reverse so children keep their order once popped.
      for (let i = fields.children.length - 1; i >= 0; i--) {
        stack.push({
          raw: fields.children[i],
          into: node.children,
          depth: depth + 1,
          path: `${path}.children.${i}`,
        })
      }
    }
  }

  return rootHolder[0]
}

function collectIds(root: MapNode): Map<string, MapNode> {
  const ids = new Map<string, MapNode>()
  const stack = [root]
  while (stack.length) {
    const node = stack.pop()!
    ids.set(node.id, node)
    if (node.children) stack.push(...node.children)
  }
  return ids
}

/** Validates an untrusted map object and returns a sanitized copy. */
export function sanitizeMap(input: unknown): MindMap {
  const parsed = mapSchema.safeParse(input)
  if (!parsed.success) throw new DocumentError('invalid-structure', describeIssue(parsed.error, 'map'))
  const raw = parsed.data
  if (raw.nodeData === undefined || raw.nodeData === null) {
    throw new DocumentError('invalid-structure', 'map.nodeData: required')
  }

  const nodeData = sanitizeNodeTree(raw.nodeData)
  const ids = collectIds(nodeData)
  const map: MindMap = { nodeData }

  // Arrows and summaries that point at missing nodes are dropped instead of
  // rejecting the whole file: they are decoration, the tree is the content.
  const arrows: MapArrow[] = []
  for (const item of raw.arrows ?? []) {
    const result = arrowSchema.safeParse(item)
    if (!result.success) continue
    const arrow = result.data
    if (!ids.has(arrow.from) || !ids.has(arrow.to)) continue
    if (arrow.style) {
      arrow.style.stroke = cleanColor(arrow.style.stroke)
      arrow.style.labelColor = cleanColor(arrow.style.labelColor)
    }
    arrows.push(arrow)
  }
  if (arrows.length) map.arrows = arrows

  const summaries: MapSummary[] = []
  for (const item of raw.summaries ?? []) {
    const result = summarySchema.safeParse(item)
    if (!result.success) continue
    const summary = result.data
    const parent = ids.get(summary.parent)
    const childCount = parent?.children?.length ?? 0
    if (!parent || summary.start > summary.end || summary.end >= childCount) continue
    if (summary.style) {
      summary.style.stroke = cleanColor(summary.style.stroke)
      summary.style.labelColor = cleanColor(summary.style.labelColor)
    }
    summaries.push(summary)
  }
  if (summaries.length) map.summaries = summaries

  if (raw.direction !== undefined) map.direction = raw.direction
  if (raw.compact) map.compact = true
  return map
}
