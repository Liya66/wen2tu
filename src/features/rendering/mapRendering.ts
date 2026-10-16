import type { MainLineParams, MindElixirInstance, NodeObj, SubLineParams, Theme, Topic } from 'mind-elixir'
import { mainBranchPath, subBranchPath, topicKind } from '../appearance/branchPath'
import { toHexColor } from '../appearance/nodeStyles'
import { OUTLINE_SHAPES, outlinePath } from '../appearance/nodeShapes'
import type { LineSettings, MapNode, MapTheme, MindMap, NodeShape } from '../mindmap/types'
import './mapRendering.css'

/*
 * wen2tu's look on top of Mind Elixir, shared by the editor and the viewer in
 * exported HTML files so both render a map identically.
 */

export type MapShape = NonNullable<MindMap['shape']>

/** Corner radius per map shape: center topic, first-level topics, boxed subtopics. */
export const SHAPE_RADII: Record<MapShape, { root: string; main: string; sub: string }> = {
  square: { root: '0px', main: '0px', sub: '0px' },
  rounded: { root: '10px', main: '8px', sub: '8px' },
  pill: { root: '999px', main: '999px', sub: '999px' },
}

type SubBranch = NonNullable<Theme['generateSubBranch']>
type ShapedNode = NodeObj & { shape?: NodeShape }

const LINE_OPACITY: Record<NonNullable<LineSettings['strength']>, string> = {
  standard: '1',
  soft: '0.55',
  faint: '0.28',
  // Hidden connectors aren't drawn at all; what remains are underlines, shown fully.
  hidden: '1',
}
const LINE_WIDTH: Record<NonNullable<LineSettings['width']>, { main: number; sub: number }> = {
  thin: { main: 2, sub: 1.25 },
  standard: { main: 3, sub: 2 },
  bold: { main: 4.5, sub: 3 },
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const DASHES: Record<string, string> = { solid: 'none', dashed: '6 4', dotted: '1.5 3.5' }
const BORDER = /^(\d+(?:\.\d+)?)px\s+(solid|dashed|dotted)\s+(.+)$/

function parseBorder(value: string | undefined) {
  const match = value?.match(BORDER)
  return match ? { width: Number(match[1]), style: match[2], color: match[3] } : null
}
type MainBranch = NonNullable<Theme['generateMainBranch']>

export function toEngineTheme(
  theme: MapTheme,
  branches?: { sub: SubBranch; main: MainBranch },
  shape?: MapShape,
): Theme {
  const cssVar = { ...theme.cssVar }
  if (shape) {
    cssVar['--root-radius'] = SHAPE_RADII[shape].root
    cssVar['--main-radius'] = SHAPE_RADII[shape].main
  }
  return {
    name: theme.name,
    type: theme.type,
    palette: [...theme.palette],
    cssVar,
    generateSubBranch: branches?.sub,
    generateMainBranch: branches?.main,
  }
}

/**
 * Installs wen2tu's rendering on a Mind Elixir instance:
 * - branch lines attached to topic edges, with no underline under styled
 *   (boxed, filled or underlined) topics;
 * - a map-wide topic shape (see mapRendering.css);
 * - borders chosen for first-level topics win over the engine's branch color.
 *
 * `getShape` and `getLines` return the map-wide shape and line settings.
 */
export function installMapRendering(
  mind: MindElixirInstance,
  { getShape, getLines }: { getShape: () => MapShape | undefined; getLines: () => LineSettings | undefined },
) {
  const pathOptions = () => {
    const lines = getLines()
    return { style: lines?.style, hidden: lines?.strength === 'hidden' }
  }
  // The engine only passes geometry to the branch functions, so styled topics
  // are looked up by the position of their wrapper, indexed once per layout pass.
  const defaultSubBranch = mind.generateSubBranch
  const defaultMainBranch = mind.generateMainBranch
  const main: MainBranch = function (this: MindElixirInstance, params: MainLineParams) {
    if (params.direction !== 'lhs' && params.direction !== 'rhs') {
      // The downward layout keeps the engine's lines (it has no underlines).
      return pathOptions().hidden ? '' : defaultMainBranch.call(this, params)
    }
    return mainBranchPath(params, pathOptions())
  }
  let styledIndex: Map<string, Topic> | null = null
  const engineLinkDiv = mind.linkDiv
  mind.linkDiv = function (...args) {
    styledIndex = null
    return engineLinkDiv.apply(this, args)
  }
  // With a map-wide shape every subtopic is drawn boxed, except where the
  // topic's own style says otherwise.
  const kindOf = (node: NodeObj | undefined) => {
    const style = node?.style as MapNode['style']
    // Extra shapes are always drawn as boxes.
    if ((node as ShapedNode | undefined)?.shape) return 'box' as const
    return topicKind(style) ?? (getShape() && style?.border !== 'none' ? ('box' as const) : null)
  }
  const styledTopicAt = (top: number, left: number, width: number, height: number) => {
    if (!styledIndex) {
      styledIndex = new Map()
      for (const tpc of mind.nodes.querySelectorAll<Topic>('me-children me-tpc')) {
        if (!kindOf(tpc.nodeObj)) continue
        const wrapper = tpc.parentElement!
        const key = `${wrapper.offsetTop},${wrapper.offsetLeft},${wrapper.offsetWidth},${wrapper.offsetHeight}`
        if (!styledIndex.has(key)) styledIndex.set(key, tpc)
      }
    }
    return styledIndex.get(`${top},${left},${width},${height}`)
  }
  const sub: SubBranch = function (this: MindElixirInstance, params: SubLineParams) {
    if (params.direction !== 'lhs' && params.direction !== 'rhs') {
      return pathOptions().hidden ? '' : defaultSubBranch.call(this, params)
    }
    const childTopic = styledTopicAt(params.cT, params.cL, params.cW, params.cH)
    const parentTopic = params.isFirst ? undefined : styledTopicAt(params.pT, params.pL, params.pW, params.pH)
    const gap = parseInt(this.container.style.getPropertyValue('--node-gap-x')) || 30
    const child = childTopic && {
      kind: kindOf(childTopic.nodeObj)!,
      top: params.cT + childTopic.offsetTop,
      left: params.cL + childTopic.offsetLeft,
      width: childTopic.offsetWidth,
      height: childTopic.offsetHeight,
    }
    const parentKind = parentTopic ? (kindOf(parentTopic.nodeObj) ?? undefined) : undefined
    return subBranchPath(params, gap, child, parentKind, pathOptions())
  }
  const branches = { sub, main }

  // Extra shapes: mark topics when they are created, so the shape's padding is
  // part of the layout (see mapRendering.css).
  const engineCreateTopic = mind.createTopic
  mind.createTopic = function (nodeObj) {
    const tpc = engineCreateTopic.call(this, nodeObj)
    const shape = (nodeObj as ShapedNode).shape
    if (shape) tpc.dataset.shape = shape
    return tpc
  }

  // The engine paints first-level topics' borders in their branch color on
  // every layout. Remember that color (subtopics inherit it), then let a
  // border chosen in the style panel win.
  const mainBranchColors = new WeakMap<NodeObj, string>()
  mind.bus.addListener('linkDiv', () => {
    for (const tpc of mind.nodes.querySelectorAll<Topic>('me-main > me-wrapper > me-parent > me-tpc')) {
      if (tpc.style.borderColor) {
        const color = toHexColor(tpc.style.borderColor)
        mainBranchColors.set(tpc.nodeObj, color)
        // Boxed subtopics (map-wide shape) outline themselves in their branch color.
        tpc.closest<HTMLElement>('me-wrapper')?.style.setProperty('--wen2tu-branch', color)
      }
      const style = tpc.nodeObj?.style as MapNode['style'] | undefined
      if (style?.border) tpc.style.border = style.border
      if (style?.borderBottom) tpc.style.borderBottom = style.borderBottom
    }
    for (const tpc of mind.nodes.querySelectorAll<Topic>('me-children me-tpc')) {
      const color = tpc.nodeObj?.branchColor
      if (color) tpc.closest<HTMLElement>('me-wrapper')?.style.setProperty('--wen2tu-branch', color)
    }
    // After layout, sizes are final: color and outline every shaped topic.
    for (const tpc of mind.nodes.querySelectorAll<Topic>('me-tpc[data-shape]')) drawShape(tpc)
  })

  /** Sets a shaped topic's colors and (for outline shapes) its SVG outline. */
  const drawShape = (tpc: Topic) => {
    const node = tpc.nodeObj as ShapedNode
    const shape = node.shape
    if (!shape) return
    const style = (node.style ?? {}) as NonNullable<MapNode['style']>
    const depth = !node.parent ? 0 : !node.parent.parent ? 1 : 2
    const border = parseBorder(style.border) ?? parseBorder(style.borderBottom)
    const stroke = border?.color ?? lineColorOf(node) ?? 'var(--root-bgcolor)'
    let fill: string
    if (style.background) fill = style.background
    else if (depth === 0) fill = 'var(--root-bgcolor)'
    else if (depth === 1) fill = 'var(--main-bgcolor)'
    else fill = `color-mix(in srgb, ${stroke} 16%, var(--bgcolor))`
    tpc.style.setProperty('--wen2tu-shape-stroke', stroke)
    tpc.style.setProperty('--wen2tu-shape-fill', fill)
    tpc.style.setProperty('--wen2tu-shape-width', String(border?.width ?? 2))
    tpc.style.setProperty('--wen2tu-shape-dash', DASHES[border?.style ?? 'solid'])

    if (!OUTLINE_SHAPES.has(shape)) return
    let svg = tpc.querySelector<SVGSVGElement>(':scope > svg.wen2tu-shape')
    if (!svg) {
      svg = document.createElementNS(SVG_NS, 'svg')
      svg.setAttribute('class', 'wen2tu-shape')
      svg.setAttribute('aria-hidden', 'true')
      svg.appendChild(document.createElementNS(SVG_NS, 'path'))
      tpc.prepend(svg)
    }
    const w = tpc.offsetWidth
    const h = tpc.offsetHeight
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    svg.firstElementChild!.setAttribute('d', outlinePath(shape, w, h, Boolean(tpc.closest('.lhs'))))
  }

  /** Color of the branch line leading to a topic (undefined for the root). */
  const lineColorOf = (node: NodeObj): string | undefined => {
    for (let current: NodeObj | undefined = node; current?.parent; current = current.parent) {
      if (current.branchColor) return current.branchColor
      if (!current.parent.parent) return mainBranchColors.get(current)
    }
    return undefined
  }

  /** Applies a color scheme and the current shape; `refresh` re-lays out the map. */
  const applyTheme = (theme: MapTheme, refresh: boolean) => {
    const shape = getShape()
    // The shape class changes topic sizes (boxed subtopics get padding and a
    // border), so it must be in place before changeTheme lays out and draws
    // the branch lines; otherwise lines are measured against the old sizes.
    mind.container.style.setProperty('--wen2tu-sub-radius', shape ? SHAPE_RADII[shape].sub : '')
    // On the host element, not the engine's container: Mind Elixir only starts a
    // box selection when the container's className is exactly "map-container".
    mind.el.classList.toggle('wen2tu-shaped', Boolean(shape))
    // Line strength and width only restyle the drawn lines (see mapRendering.css).
    const lines = getLines()
    mind.el.style.setProperty('--wen2tu-line-opacity', LINE_OPACITY[lines?.strength ?? 'standard'])
    const width = LINE_WIDTH[lines?.width ?? 'standard']
    mind.el.style.setProperty('--wen2tu-main-line', String(width.main))
    mind.el.style.setProperty('--wen2tu-sub-line', String(width.sub))
    mind.changeTheme(toEngineTheme(theme, branches, shape), refresh)
  }

  return { branches, lineColorOf, applyTheme }
}

/** Lowest zoom used when opening a map that is larger than the screen. */
const MIN_OPEN_SCALE = 0.6

/** Zooms out (not below 60%) so a large map fits, then centers it. */
export function fitToScreen(mind: MindElixirInstance) {
  mind.scale(1)
  const fit = Math.min(
    mind.container.offsetWidth / mind.nodes.offsetWidth,
    mind.container.offsetHeight / mind.nodes.offsetHeight,
  )
  if (fit < 1) mind.scale(Math.max(MIN_OPEN_SCALE, fit))
  mind.toCenter()
}
