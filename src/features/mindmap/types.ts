/**
 * The app's own document model. Mind Elixir's data structure is wrapped
 * rather than used directly, so the file format can stay stable even if the
 * rendering engine changes.
 */

export const DOCUMENT_FORMAT = 'wen2tu'
export const DOCUMENT_VERSION = 1
export const NATIVE_EXTENSION = '.mind.json'

export type Direction = 0 | 1 | 2 | 3

export interface MapNode {
  id: string
  topic: string
  children?: MapNode[]
  expanded?: boolean
  /** Side of the root for first-level nodes (0 = left, 1 = right). */
  direction?: 0 | 1
  style?: Partial<Record<NodeStyleKey, string>>
  tags?: string[]
  icons?: string[]
  hyperLink?: string
  note?: string
  branchColor?: string
  image?: {
    url: string
    width: number
    height: number
    fit?: 'fill' | 'contain' | 'cover'
  }
}

export const NODE_STYLE_KEYS = [
  'fontSize',
  'fontFamily',
  'color',
  'background',
  'fontWeight',
  'fontStyle',
  'width',
  'border',
  'borderBottom',
  'borderRadius',
  'padding',
  'textDecoration',
] as const
export type NodeStyleKey = (typeof NODE_STYLE_KEYS)[number]

export interface MapArrow {
  id: string
  label: string
  from: string
  to: string
  delta1?: { x: number; y: number }
  delta2?: { x: number; y: number }
  bidirectional?: boolean
  style?: {
    stroke?: string
    strokeWidth?: string | number
    strokeDasharray?: string
    opacity?: string | number
    labelColor?: string
  }
}

export interface MapSummary {
  id: string
  label: string
  parent: string
  start: number
  end: number
  style?: { stroke?: string; labelColor?: string }
}

/** CSS variables a map theme may set (colors and corner radii only). */
export const THEME_VARS = [
  '--bgcolor',
  '--color',
  '--main-color',
  '--main-bgcolor',
  '--main-bgcolor-transparent',
  '--main-border',
  '--main-radius',
  '--root-color',
  '--root-bgcolor',
  '--root-border-color',
  '--root-radius',
  '--selected',
  '--accent-color',
  '--panel-color',
  '--panel-bgcolor',
  '--panel-border-color',
] as const
export type ThemeVar = (typeof THEME_VARS)[number]

/**
 * Colors of a map. `name` is a preset id (e.g. "ocean") or "custom";
 * a map without a theme follows the system's light/dark setting.
 */
export interface MapTheme {
  name: string
  type: 'light' | 'dark'
  /** Colors handed out to main branches in turn. */
  palette: string[]
  cssVar: Partial<Record<ThemeVar, string>>
}

/** Everything needed to render a map. A sanitized subset of Mind Elixir's data. */
export interface MindMap {
  nodeData: MapNode
  arrows?: MapArrow[]
  summaries?: MapSummary[]
  direction?: Direction
  compact?: boolean
  theme?: MapTheme
}

export interface MindDocument {
  format: typeof DOCUMENT_FORMAT
  version: typeof DOCUMENT_VERSION
  map: MindMap
  meta?: {
    title?: string
    createdAt?: string
    updatedAt?: string
  }
}
