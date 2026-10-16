import type { NodeShape } from '../mindmap/types'

/*
 * Geometry of the extra topic shapes. Shapes in OUTLINE_SHAPES are drawn as an
 * SVG outline behind the topic, generated for the topic's exact pixel size so
 * corners, notches and bumps never stretch. The others (ellipse, leaf, double,
 * card, note) are plain CSS in mapRendering.css.
 */

export const OUTLINE_SHAPES: ReadonlySet<NodeShape> = new Set<NodeShape>([
  'diamond',
  'hexagon',
  'chamfer',
  'flag',
  'tag',
  'ticket',
  'folder',
  'cloud',
])

/** Shapes with a distinct inner/outer side; mirrored for topics on the left. */
export const SIDED_SHAPES: ReadonlySet<NodeShape> = new Set<NodeShape>(['flag', 'tag', 'leaf'])

const r1 = (n: number) => Math.round(n * 10) / 10

/** Scalloped outline: bumps along each edge of a box inset by the bump size. */
function cloudPath(w: number, h: number): string {
  const inset = Math.max(5, Math.min(12, h * 0.2))
  const across = Math.max(2, Math.round((w - 2 * inset) / (2.2 * inset)))
  const down = Math.max(1, Math.round((h - 2 * inset) / (2.2 * inset)))
  const stepX = (w - 2 * inset) / across
  const stepY = (h - 2 * inset) / down
  const parts = [`M ${r1(inset)} ${r1(inset)}`]
  const arc = (r: number, x: number, y: number) => `A ${r1(r)} ${r1(r)} 0 0 1 ${r1(x)} ${r1(y)}`
  for (let i = 1; i <= across; i++) parts.push(arc(stepX / 2, inset + i * stepX, inset))
  for (let i = 1; i <= down; i++) parts.push(arc(stepY / 2, w - inset, inset + i * stepY))
  for (let i = 1; i <= across; i++) parts.push(arc(stepX / 2, w - inset - i * stepX, h - inset))
  for (let i = 1; i <= down; i++) parts.push(arc(stepY / 2, inset, h - inset - i * stepY))
  return parts.join(' ') + ' Z'
}

/** Mirrors x coordinates of an absolute path (only M/L/H/V/A/Z/Q commands are used here). */
function mirror(path: string, w: number): string {
  return path.replace(/([MLHAQ])([^MLHVAQZ]*)/g, (_all, command: string, args: string) => {
    const n = args.trim().split(/[\s,]+/).filter(Boolean).map(Number)
    if (command === 'H') return `H ${r1(w - n[0])} `
    if (command === 'A') {
      // rx ry rotation large-arc sweep x y — mirroring flips the sweep direction.
      return `A ${n[0]} ${n[1]} ${n[2]} ${n[3]} ${n[4] ? 0 : 1} ${r1(w - n[5])} ${n[6]} `
    }
    const out: number[] = []
    for (let i = 0; i < n.length; i += 2) out.push(r1(w - n[i]), n[i + 1])
    return `${command} ${out.join(' ')} `
  })
}

/**
 * SVG path (in pixels) for a shape drawn as an outline. `mirrored` flips
 * sided shapes for topics on the left side of the map.
 */
export function outlinePath(shape: NodeShape, w: number, h: number, mirrored = false): string {
  let d: string
  switch (shape) {
    case 'diamond':
      d = `M ${r1(w / 2)} 0 L ${w} ${r1(h / 2)} L ${r1(w / 2)} ${h} L 0 ${r1(h / 2)} Z`
      break
    case 'hexagon': {
      const s = r1(Math.min(h / 2, w * 0.18))
      d = `M ${s} 0 H ${r1(w - s)} L ${w} ${r1(h / 2)} L ${r1(w - s)} ${h} H ${s} L 0 ${r1(h / 2)} Z`
      break
    }
    case 'chamfer': {
      const c = r1(Math.min(10, h / 3, w / 4))
      d = `M ${c} 0 H ${r1(w - c)} L ${w} ${c} V ${r1(h - c)} L ${r1(w - c)} ${h} H ${c} L 0 ${r1(h - c)} V ${c} Z`
      break
    }
    case 'flag': {
      // Swallowtail on the outer side.
      const n = r1(Math.min(14, w / 5))
      d = `M 0 0 H ${w} L ${r1(w - n)} ${r1(h / 2)} L ${w} ${h} H 0 Z`
      break
    }
    case 'tag': {
      // Point and hole on the inner side, where the branch line arrives.
      const p = r1(Math.min(16, h / 2, w / 4))
      const r = 2.6
      const cx = r1(p * 0.8 + 2)
      const cy = r1(h / 2)
      d =
        `M ${p} 0 H ${w} V ${h} H ${p} L 0 ${cy} Z ` +
        `M ${r1(cx - r)} ${cy} A ${r} ${r} 0 1 0 ${r1(cx + r)} ${cy} A ${r} ${r} 0 1 0 ${r1(cx - r)} ${cy} Z`
      break
    }
    case 'ticket': {
      const r = r1(Math.min(6, h / 4))
      const top = r1(h / 2 - r)
      const bottom = r1(h / 2 + r)
      d =
        `M 0 0 H ${w} V ${top} A ${r} ${r} 0 0 0 ${w} ${bottom} V ${h} H 0 V ${bottom} ` +
        `A ${r} ${r} 0 0 0 0 ${top} Z`
      break
    }
    case 'folder': {
      const t = 6
      const tab = r1(Math.max(24, Math.min(w * 0.38, w - 16)))
      d = `M 0 0 H ${tab} L ${r1(tab + t)} ${t} H ${w} V ${h} H 0 Z`
      break
    }
    case 'cloud':
      d = cloudPath(w, h)
      break
    default:
      return ''
  }
  return mirrored && SIDED_SHAPES.has(shape) ? mirror(d, w).trim() : d
}

/** One drawn part of a shape preview icon. */
export interface PreviewPart {
  d: string
  /** Filled with the stroke color instead of the fill color (bands, folds). */
  accent?: boolean
  /** Drawn without fill. */
  hollow?: boolean
}

/** Small icon of a shape, for the style panel and template previews. */
export function previewParts(shape: NodeShape, w: number, h: number): PreviewPart[] {
  if (OUTLINE_SHAPES.has(shape)) return [{ d: outlinePath(shape, w, h) }]
  switch (shape) {
    case 'ellipse':
      return [{ d: `M 0 ${h / 2} A ${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2} A ${w / 2} ${h / 2} 0 1 0 0 ${h / 2} Z` }]
    case 'leaf':
      return [{ d: `M 0 0 H ${w / 2} Q ${w} 0 ${w} ${h / 2} V ${h} H ${w / 2} Q 0 ${h} 0 ${h / 2} Z` }]
    case 'double':
      return [
        { d: `M 0 0 H ${w} V ${h} H 0 Z`, hollow: true },
        { d: `M 3 3 H ${w - 3} V ${h - 3} H 3 Z` },
      ]
    case 'card':
      return [{ d: `M 0 0 H ${w} V ${h} H 0 Z` }, { d: `M 0 0 H ${w} V 5 H 0 Z`, accent: true }]
    case 'note':
      return [
        { d: `M 0 0 H ${w - 6} L ${w} 6 V ${h} H 0 Z` },
        { d: `M ${w - 6} 0 V 6 H ${w} Z`, accent: true },
      ]
    default:
      return []
  }
}
