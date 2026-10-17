/**
 * What a person can change about a chart in the style panel. Everything
 * defaults to "auto": the rules in buildOption decide until the person
 * overrides them. Custom colours are stored by the name of the series,
 * slice or bar they belong to, so they follow the data when it is sorted,
 * filtered or edited.
 */
import { isHex, paletteFromHue, toOklch } from './colorMath'
import type { ChartColors } from './theme'

export type LabelMode = 'auto' | 'all' | 'none'
export type LegendMode = 'auto' | 'top' | 'bottom' | 'none'
export type Orientation = 'auto' | 'vertical' | 'horizontal'
export type SortMode = 'auto' | 'original'
export type NumberMode = 'compact' | 'full'

export interface ChartStyle {
  /** Shown above the chart and in exports; empty for none. */
  title: string
  /** A preset id, or 'custom' with `baseColor`. */
  palette: string
  baseColor?: string
  labels: LabelMode
  legend: LegendMode
  orientation: Orientation
  sort: SortMode
  numbers: NumberMode
  grid: boolean
  /** Custom colours by series / slice / bar name. */
  colors: Record<string, string>
}

export const DEFAULT_STYLE: ChartStyle = {
  title: '',
  palette: 'slate',
  labels: 'auto',
  legend: 'auto',
  orientation: 'auto',
  sort: 'auto',
  numbers: 'compact',
  grid: true,
  colors: {},
}

/** Muted one-hue palettes. Each generates ramps that pass the ordinal checks in both modes (see the tests). */
export const PALETTES: { id: string; hue: number; chroma: number }[] = [
  { id: 'slate', hue: 250, chroma: 0.07 },
  { id: 'teal', hue: 200, chroma: 0.07 },
  { id: 'green', hue: 150, chroma: 0.07 },
  { id: 'ochre', hue: 75, chroma: 0.08 },
  { id: 'carrot', hue: 50, chroma: 0.1 },
  { id: 'rose', hue: 5, chroma: 0.08 },
  { id: 'violet', hue: 295, chroma: 0.07 },
  { id: 'gray', hue: 250, chroma: 0.012 },
]

/** The hue and chroma a style's palette is built from. */
export function paletteBase(style: ChartStyle): { hue: number; chroma: number } {
  if (style.palette === 'custom' && style.baseColor && isHex(style.baseColor)) {
    const { c, h } = toOklch(style.baseColor)
    // Keep the chart quiet: very saturated picks are toned down to the presets' range.
    return { hue: h, chroma: Math.min(c, 0.12) }
  }
  return PALETTES.find((p) => p.id === style.palette) ?? PALETTES[0]
}

/** The theme colours with the style's palette in place of the default slate. */
export function styledColors(colors: ChartColors, style: ChartStyle): ChartColors {
  const { hue, chroma } = paletteBase(style)
  return { ...colors, ...paletteFromHue(hue, chroma, colors.mode) }
}
