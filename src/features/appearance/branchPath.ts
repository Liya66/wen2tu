import type { MapNode } from '../mindmap/types'
import type { LineSettings } from '../mindmap/types'

/**
 * How a topic is connected:
 * - `box`: it has a visible border or fill, or its border is set to "none",
 *   so the branch meets its side, centered, and no underline is drawn;
 * - `underline`: it draws its own underline, so the branch ends where that line starts.
 * Plain topics (null) get the engine-style underlined branch.
 */
export type TopicKind = 'box' | 'underline'

export function topicKind(style: MapNode['style']): TopicKind | null {
  if (!style) return null
  // Underline mode also sets border: none, so check it first.
  if (style.borderBottom) return 'underline'
  if (style.border || (style.background && style.background !== 'transparent')) return 'box'
  return null
}

/** The visible topic rectangle, in the same coordinates as the branch parameters. */
export interface TopicRect {
  kind: TopicKind
  top: number
  left: number
  width: number
  height: number
}

export interface SubBranchParams {
  pT: number
  pL: number
  pW: number
  pH: number
  cT: number
  cL: number
  cW: number
  cH: number
  direction: 'lhs' | 'rhs' | string
  isFirst: boolean | undefined
}

/** Line options that change the path (strength and width are styling only). */
export interface PathOptions {
  style?: LineSettings['style']
  /** Hidden connectors: only plain topics' underlines are drawn. */
  hidden?: boolean
}

/**
 * Connector between two points in the chosen line style. `trunkX` is where
 * elbow lines turn, shared by siblings so they form one trunk.
 */
function connector(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  style: LineSettings['style'],
  curve: string,
  trunkX: number,
): string {
  if (style === 'straight') return `M ${sx} ${sy} L ${ex} ${ey}`
  if (style === 'elbow') {
    const dy = ey - sy
    if (Math.abs(dy) < 1) return `M ${sx} ${sy} H ${ex}`
    const sgnX = Math.sign(ex - sx) || 1
    const sgnY = Math.sign(dy)
    const r = Math.min(6, Math.abs(dy) / 2, Math.abs(trunkX - sx), Math.abs(ex - trunkX))
    return (
      `M ${sx} ${sy} H ${trunkX - sgnX * r} Q ${trunkX} ${sy} ${trunkX} ${sy + sgnY * r} ` +
      `V ${ey - sgnY * r} Q ${trunkX} ${ey} ${trunkX + sgnX * r} ${ey} H ${ex}`
    )
  }
  return curve
}

/**
 * SVG path from a parent topic to a child topic, always attached to the
 * topics' edges, without underlines for styled topics.
 *
 * `gap` is the horizontal padding around topics (`--node-gap-x`): parent and
 * child rectangles (`p*`, `c*`) include it, the visible topic does not.
 */
export function subBranchPath(
  params: SubBranchParams,
  gap: number,
  child: TopicRect | undefined,
  parentKind: TopicKind | undefined,
  options: PathOptions = {},
): string {
  const { pT, pL, pW, pH, cT, cL, cW, cH, direction, isFirst } = params
  const lhs = direction === 'lhs'
  const parentEdge = lhs ? pL : pL + pW
  // Start at the edge of the visible parent topic. Deeper topics sit inside
  // `gap` of horizontal padding; first-level topics have none. (The engine's
  // own path starts `gap` inside first-level topics too, which only stays
  // hidden while they have an opaque fill.)
  const inset = isFirst ? 0 : gap
  const startX = lhs ? parentEdge + inset : parentEdge - inset
  // First-level topics and boxed topics are joined at their middle; plain
  // topics continue from their underline.
  const startY = isFirst || parentKind === 'box' ? pT + pH / 2 : pT + pH

  let endX: number
  let endY: number
  let tail = ''
  if (child) {
    endX = lhs ? child.left + child.width : child.left
    endY = child.kind === 'box' ? child.top + child.height / 2 : child.top + child.height
  } else {
    endX = lhs ? parentEdge - gap : parentEdge + gap
    endY = cT + cH
    // The underline beneath a plain topic.
    tail = ` H ${lhs ? cL + gap : cL + cW - gap}`
  }

  if (options.hidden) return tail ? `M ${endX} ${endY}${tail}` : ''

  const bend = (Math.abs(startY - endY) / 300) * gap
  const control = lhs ? parentEdge + bend : parentEdge - bend
  const curve = `M ${startX} ${startY} C ${parentEdge} ${startY} ${control} ${endY} ${endX} ${endY}`
  return connector(startX, startY, endX, endY, options.style, curve, (startX + endX) / 2) + tail
}

/** Mixes a color with white; `amount` is how much of the color remains. */
export function tint(hex: string, amount = 0.25): string {
  const value = hex.replace('#', '')
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16))
  if (channels.some(Number.isNaN)) return '#fdeccd'
  return (
    '#' +
    channels
      .map((c) => Math.round(c * amount + 255 * (1 - amount)))
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
  )
}

export interface MainBranchParams {
  pT: number
  pL: number
  pW: number
  pH: number
  cT: number
  cL: number
  cW: number
  cH: number
  direction: 'lhs' | 'rhs' | string
}

/**
 * SVG path from the center topic to a first-level topic. It leaves the center
 * topic from the middle of its side, so it never crosses the center topic's
 * text (the engine's own path starts inside it).
 */
export function mainBranchPath(
  { pT, pL, pW, pH, cT, cL, cW, cH, direction }: MainBranchParams,
  options: PathOptions = {},
): string {
  if (options.hidden) return ''
  const lhs = direction === 'lhs'
  const startX = lhs ? pL : pL + pW
  const startY = pT + pH / 2
  const endX = lhs ? cL + cW : cL
  const endY = cT + cH / 2
  const span = endX - startX
  const curve = `M ${startX} ${startY} C ${startX + span * 0.5} ${startY} ${startX + span * 0.2} ${endY} ${endX} ${endY}`
  // Elbow lines from the center share one trunk per side, close to the center.
  return connector(startX, startY, endX, endY, options.style, curve, startX + Math.sign(span) * Math.min(28, Math.abs(span) / 2))
}
