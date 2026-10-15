import type { MapNode, NodeStyleKey } from '../mindmap/types'

/** A partial style change. An empty string removes the property (back to the theme default). */
export type StylePatch = Partial<Record<NodeStyleKey, string>>

export type CornerShape = 'square' | 'rounded' | 'pill'
export type BorderMode = 'default' | 'none' | 'full' | 'underline'
export type FillMode = 'default' | 'none' | 'solid'
export type LineStyle = 'solid' | 'dashed' | 'dotted'

/** The editable look of a node, as the style panel presents it. */
export interface NodeLook {
  shape?: CornerShape
  border: BorderMode
  borderWidth: number
  borderStyle: LineStyle
  borderColor: string
  fill: FillMode
  fillColor: string
  textColor?: string
  fontSize?: string
  bold: boolean
  italic: boolean
  strike: boolean
}

export const RADIUS: Record<CornerShape, string> = { square: '0px', rounded: '8px', pill: '999px' }
export const FONT_SIZES = ['12', '14', '16', '20', '24', '32'] as const
export const DEFAULT_BORDER_COLOR = '#5b4fe9'
export const DEFAULT_FILL_COLOR = '#fff3bf'

const BORDER_PATTERN = /^(\d+(?:\.\d+)?)px\s+(solid|dashed|dotted)\s+(.+)$/

function parseBorder(value: string | undefined) {
  const match = value?.match(BORDER_PATTERN)
  return match ? { width: Number(match[1]), style: match[2] as LineStyle, color: match[3] } : null
}

/** Reads a node's stored style back into panel state. */
export function readLook(style: MapNode['style'] = {}): NodeLook {
  const full = parseBorder(style.border)
  const under = parseBorder(style.borderBottom)
  const line = full ?? under
  let border: BorderMode = 'default'
  if (full) border = 'full'
  else if (under) border = 'underline'
  else if (style.border === 'none') border = 'none'

  let fill: FillMode = 'default'
  if (style.background === 'transparent') fill = 'none'
  else if (style.background) fill = 'solid'

  const shape = (Object.keys(RADIUS) as CornerShape[]).find((key) => RADIUS[key] === style.borderRadius)
  return {
    shape,
    border,
    borderWidth: line?.width ?? 2,
    borderStyle: line?.style ?? 'solid',
    borderColor: line?.color ?? DEFAULT_BORDER_COLOR,
    fill,
    fillColor: fill === 'solid' ? style.background! : DEFAULT_FILL_COLOR,
    textColor: style.color || undefined,
    fontSize: style.fontSize || undefined,
    bold: style.fontWeight === 'bold',
    italic: style.fontStyle === 'italic',
    strike: style.textDecoration === 'line-through',
  }
}

/**
 * Converts panel state into a style patch. Deeper topics have almost no
 * padding by default, so a box (fill or full border) gets some room.
 */
export function lookToStyle(look: NodeLook, depth: number): StylePatch {
  const line = `${look.borderWidth}px ${look.borderStyle} ${look.borderColor}`
  const boxed = look.border === 'full' || look.fill === 'solid'
  const patch: StylePatch = {
    borderRadius: look.shape ? RADIUS[look.shape] : '',
    border: look.border === 'full' ? line : look.border === 'default' ? '' : 'none',
    borderBottom: look.border === 'underline' ? line : '',
    background: look.fill === 'solid' ? look.fillColor : look.fill === 'none' ? 'transparent' : '',
    color: look.textColor ?? '',
    fontSize: look.fontSize ?? '',
    fontWeight: look.bold ? 'bold' : '',
    fontStyle: look.italic ? 'italic' : '',
    textDecoration: look.strike ? 'line-through' : '',
  }
  if (depth >= 2) patch.padding = boxed ? '4px 10px' : ''
  return patch
}

/** Every style property the panel controls, cleared. */
export const CLEAR_STYLE: StylePatch = {
  borderRadius: '',
  border: '',
  borderBottom: '',
  background: '',
  color: '',
  fontSize: '',
  fontWeight: '',
  fontStyle: '',
  textDecoration: '',
  padding: '',
}

/** Normalizes any CSS color to #rrggbb for <input type="color">. */
export function toHexColor(value: string | undefined, fallback = '#000000'): string {
  if (!value) return fallback
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return ('#' + value.slice(1).replace(/./g, (c) => c + c)).toLowerCase()
  }
  const rgb = value.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i)
  if (rgb) return '#' + rgb.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')
  return fallback
}

/** Black or white, whichever reads better on the given background (WCAG relative luminance). */
export function readableTextOn(background: string): string {
  const hex = toHexColor(background, '#ffffff')
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  return luminance > 0.4 ? '#1f2937' : '#ffffff'
}

/**
 * Applies `changes` to a topic's current look. When a fill is involved and the
 * text color was never chosen by hand, the text color follows the fill so the
 * topic stays readable.
 */
export function mergeLook(current: NodeLook, changes: Partial<NodeLook>): NodeLook {
  const next = { ...current, ...changes }
  if ('textColor' in changes) return next
  const autoText =
    !current.textColor || (current.fill === 'solid' && current.textColor === readableTextOn(current.fillColor))
  if (!autoText) return next
  if (next.fill === 'solid') next.textColor = readableTextOn(next.fillColor)
  else if (current.fill === 'solid') next.textColor = undefined // fill removed: drop the automatic color
  return next
}
