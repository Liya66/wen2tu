import type { NodeShape } from '../mindmap/types'

/*
 * Geometry of the extra topic shapes. Shapes in OUTLINE_SHAPES are drawn as an
 * SVG outline behind the topic, generated for the topic's exact pixel size so
 * corners, notches and bumps never stretch. The others (ellipse, double, card,
 * note) are plain CSS in mapRendering.css.
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
  'leaf',
])

/** Shapes with a distinct inner/outer side; mirrored for topics on the left. */
export const SIDED_SHAPES: ReadonlySet<NodeShape> = new Set<NodeShape>(['flag', 'tag', 'leaf'])

const r1 = (n: number) => Math.round(n * 10) / 10

// Cloud lobes after the big first one: [radius, top] as fractions of the height.
const LOBES: ReadonlyArray<readonly [number, number]> = [
  [0.42, 0],
  [0.31, 0.17],
  [0.36, 0.07],
  [0.29, 0.2],
  [0.34, 0.1],
]

interface Circle {
  x: number
  y: number
  r: number
}

/**
 * Cloud like ☁️: a flat base under a row of uneven lobes — a small one on the
 * left, the biggest next to it, then smaller ones, ending in a medium lobe on
 * the right. The outline follows each lobe from where it meets the previous
 * one to where it meets the next. Wide topics stretch the lobes a little
 * before adding more of them.
 */
function cloudPath(w: number, h: number): string {
  const sx = Math.min(1.3, Math.max(1, w / (3 * h)))
  const width = w / sx
  const left = 0.3 * h
  const right = 0.4 * h
  const span = width - left - right
  const count = Math.max(1, Math.round(span / (0.6 * h)))
  // Gaps between lobe centres; the last one is wider so the big lobe sits left of centre.
  const total = count + 1.25
  const circles: Circle[] = [{ x: left, y: h - left, r: left }]
  for (let i = 0; i < count; i++) {
    const [r, top] = LOBES[i % LOBES.length]
    circles.push({ x: left + (span * (i + 1)) / total, y: (top + r) * h, r: r * h })
  }
  circles.push({ x: width - right, y: h - right, r: right })

  const X = (x: number) => r1(x * sx)
  const angle = (c: Circle, x: number, y: number) => Math.atan2(y - c.y, x - c.x)
  let from = { x: left, y: h }
  const parts = [`M ${X(from.x)} ${r1(h)}`]
  circles.forEach((a, i) => {
    const b = circles[i + 1]
    let to = { x: a.x, y: h }
    if (b) {
      // Upper crossing point of this lobe and the next.
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.hypot(dx, dy)
      const along = (a.r * a.r - b.r * b.r + d * d) / (2 * d)
      const off = Math.sqrt(Math.max(0, a.r * a.r - along * along))
      const mx = a.x + (dx * along) / d
      const my = a.y + (dy * along) / d
      const p = { x: mx + (dy * off) / d, y: my - (dx * off) / d }
      const q = { x: mx - (dy * off) / d, y: my + (dx * off) / d }
      to = p.y < q.y ? p : q
    }
    let sweep = angle(a, to.x, to.y) - angle(a, from.x, from.y)
    while (sweep < 0) sweep += 2 * Math.PI
    parts.push(`A ${X(a.r)} ${r1(a.r)} 0 ${sweep > Math.PI ? 1 : 0} 1 ${X(to.x)} ${r1(to.y)}`)
    from = to
  })
  return parts.join(' ') + ' Z'
}

/** Mirrors x coordinates of an absolute path (only M/L/H/V/A/Z/Q/C commands are used here). */
function mirror(path: string, w: number): string {
  return path.replace(/([MLHAQC])([^MLHVAQCZ]*)/g, (_all, command: string, args: string) => {
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
    case 'leaf': {
      // Pointed at the top inner and bottom outer corners, full curves between.
      const c = r1(Math.min(w / 2, h * 1.6))
      const k = r1(c * 0.45)
      d =
        `M 0 0 H ${r1(w - c)} C ${r1(w - k)} 0 ${w} ${r1(h * 0.45)} ${w} ${h} ` +
        `H ${c} C ${k} ${h} 0 ${r1(h * 0.55)} 0 0 Z`
      break
    }
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
