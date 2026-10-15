import type { MainLineParams, MindElixirInstance, NodeObj, SubLineParams, Theme, Topic } from 'mind-elixir'
import { mainBranchPath, subBranchPath, topicKind } from '../appearance/branchPath'
import { toHexColor } from '../appearance/nodeStyles'
import type { MapNode, MapTheme, MindMap } from '../mindmap/types'
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
 * `getShape` returns the current map-wide shape.
 */
export function installMapRendering(mind: MindElixirInstance, getShape: () => MapShape | undefined) {
  // The engine only passes geometry to the branch functions, so styled topics
  // are looked up by the position of their wrapper, indexed once per layout pass.
  const defaultSubBranch = mind.generateSubBranch
  const defaultMainBranch = mind.generateMainBranch
  const main: MainBranch = function (this: MindElixirInstance, params: MainLineParams) {
    if (params.direction !== 'lhs' && params.direction !== 'rhs') return defaultMainBranch.call(this, params)
    return mainBranchPath(params)
  }
  let styledIndex: Map<string, Topic> | null = null
  const engineLinkDiv = mind.linkDiv
  mind.linkDiv = function (...args) {
    styledIndex = null
    return engineLinkDiv.apply(this, args)
  }
  // With a map-wide shape every subtopic is drawn boxed, except where the
  // topic's own style says otherwise.
  const kindOf = (style: MapNode['style']) =>
    topicKind(style) ?? (getShape() && style?.border !== 'none' ? ('box' as const) : null)
  const styledTopicAt = (top: number, left: number, width: number, height: number) => {
    if (!styledIndex) {
      styledIndex = new Map()
      for (const tpc of mind.nodes.querySelectorAll<Topic>('me-children me-tpc')) {
        if (!kindOf(tpc.nodeObj?.style as MapNode['style'])) continue
        const wrapper = tpc.parentElement!
        const key = `${wrapper.offsetTop},${wrapper.offsetLeft},${wrapper.offsetWidth},${wrapper.offsetHeight}`
        if (!styledIndex.has(key)) styledIndex.set(key, tpc)
      }
    }
    return styledIndex.get(`${top},${left},${width},${height}`)
  }
  const sub: SubBranch = function (this: MindElixirInstance, params: SubLineParams) {
    if (params.direction !== 'lhs' && params.direction !== 'rhs') return defaultSubBranch.call(this, params)
    const childTopic = styledTopicAt(params.cT, params.cL, params.cW, params.cH)
    const parentTopic = params.isFirst ? undefined : styledTopicAt(params.pT, params.pL, params.pW, params.pH)
    const gap = parseInt(this.container.style.getPropertyValue('--node-gap-x')) || 30
    const child = childTopic && {
      kind: kindOf(childTopic.nodeObj.style as MapNode['style'])!,
      top: params.cT + childTopic.offsetTop,
      left: params.cL + childTopic.offsetLeft,
      width: childTopic.offsetWidth,
      height: childTopic.offsetHeight,
    }
    const parentKind = parentTopic ? (kindOf(parentTopic.nodeObj.style as MapNode['style']) ?? undefined) : undefined
    return subBranchPath(params, gap, child, parentKind)
  }
  const branches = { sub, main }

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
  })

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
    mind.container.classList.toggle('wen2tu-shaped', Boolean(shape))
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
