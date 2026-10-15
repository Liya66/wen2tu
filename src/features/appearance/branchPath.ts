import type { MapNode } from '../mindmap/types'

/**
 * How a styled topic should be connected:
 * - `box`: it has a visible border or fill, so the branch meets its side, centered,
 *   and no underline is drawn beneath it;
 * - `underline`: it draws its own underline, so the branch ends where that line starts.
 * Unstyled topics (null) keep the engine's default underlined branch.
 */
export type TopicKind = 'box' | 'underline'

export function topicKind(style: MapNode['style']): TopicKind | null {
  if (!style) return null
  if ((style.border && style.border !== 'none') || (style.background && style.background !== 'transparent')) {
    return 'box'
  }
  if (style.borderBottom) return 'underline'
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

/**
 * SVG path from a parent topic to a child topic, following Mind Elixir's
 * default curve, always attached to the topics' edges, and without
 * underlines for styled topics.
 *
 * `gap` is the horizontal padding around topics (`--node-gap-x`): parent and
 * child rectangles (`p*`, `c*`) include it, the visible topic does not.
 */
export function subBranchPath(
  params: SubBranchParams,
  gap: number,
  child: TopicRect | undefined,
  parentKind: TopicKind | undefined,
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
    // The underline beneath an unstyled topic.
    tail = ` H ${lhs ? cL + gap : cL + cW - gap}`
  }
  const bend = (Math.abs(startY - endY) / 300) * gap
  const control = lhs ? parentEdge + bend : parentEdge - bend
  return `M ${startX} ${startY} C ${parentEdge} ${startY} ${control} ${endY} ${endX} ${endY}${tail}`
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
