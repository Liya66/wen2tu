/**
 * Colour maths for chart palettes, small enough to run on every change in
 * the style panel: OKLab/OKLCH conversion, WCAG contrast, colour-vision-
 * deficiency simulation (Machado, Oliveira & Fernandes 2009, severity 1.0),
 * one-hue ramps generated from any hue, and the checks behind the panel's
 * colour warnings.
 */

type Rgb = [number, number, number]

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

export function isHex(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value)
}

function linearRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255)) as Rgb
}

function oklabFromLinear([r, g, b]: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function linearFromOklab([L, A, B]: Rgb): Rgb {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

/** OKLCH lightness (0–1), chroma and hue (degrees). */
export function toOklch(hex: string): { l: number; c: number; h: number } {
  const [L, A, B] = oklabFromLinear(linearRgb(hex))
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 }
}

/** The colour at OKLCH (l, c, h), with chroma reduced until it fits in sRGB. */
export function fromOklch(l: number, c: number, h: number): string {
  const rad = (h * Math.PI) / 180
  for (let chroma = c; chroma >= 0; chroma -= 0.004) {
    const rgb = linearFromOklab([l, chroma * Math.cos(rad), chroma * Math.sin(rad)])
    if (rgb.every((v) => v >= -0.0005 && v <= 1.0005) || chroma < 0.004) {
      return '#' + rgb.map((v) => Math.round(Math.min(1, Math.max(0, toGamma(v))) * 255).toString(16).padStart(2, '0')).join('')
    }
  }
  return '#808080'
}

/** WCAG contrast ratio. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, b2] = linearRgb(hex)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b2
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const MACHADO: Record<'protan' | 'deutan' | 'tritan', number[][]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
}

function simulate(rgb: Rgb, kind: keyof typeof MACHADO): Rgb {
  const m = MACHADO[kind]
  return m.map((row) => Math.max(0, Math.min(1, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]))) as Rgb
}

/** Colour difference in OKLab ×100, as seen with typical vision or a colour-vision deficiency. */
export function deltaE(a: string, b: string, kind?: keyof typeof MACHADO): number {
  const [x, y] = [linearRgb(a), linearRgb(b)].map((rgb) => oklabFromLinear(kind ? simulate(rgb, kind) : rgb))
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

/** The harder of the two red–green deficiencies (the common ones). */
export function cvdDelta(a: string, b: string): number {
  return Math.min(deltaE(a, b, 'protan'), deltaE(a, b, 'deutan'))
}

// ---- generated palettes ----

export interface HuePalette {
  /** Five steps, least to most prominent. */
  ramp: string[]
  accent: string
  /** Heatmaps: near the surface (low) to the most prominent step (high). */
  sequential: string[]
}

const RAMP_L = { light: [0.76, 0.66, 0.56, 0.46, 0.36], dark: [0.5, 0.59, 0.68, 0.77, 0.86] }
const ACCENT_L = { light: 0.52, dark: 0.74 }
const SEQUENTIAL_L = { light: [0.965, 0.86, 0.72, 0.54, 0.36], dark: [0.31, 0.41, 0.56, 0.72, 0.9] }

/**
 * A one-hue palette: five steps of evenly spaced lightness (ΔL 0.09–0.10, so
 * neighbours stay visible), the lightest still at least 2:1 against the card.
 */
export function paletteFromHue(hue: number, chroma: number, mode: 'light' | 'dark'): HuePalette {
  return {
    ramp: RAMP_L[mode].map((l) => fromOklch(l, chroma, hue)),
    accent: fromOklch(ACCENT_L[mode], chroma, hue),
    sequential: SEQUENTIAL_L[mode].map((l, i) => fromOklch(l, chroma * (i === 0 ? 0.35 : i === 1 ? 0.7 : 1), hue)),
  }
}

// ---- warnings for custom colours ----

/** Below these, two marks are hard to tell apart (OKLab ΔE ×100). */
export const SIMILAR_LIMIT = 8
export const CVD_LIMIT = 6
/** A mark lighter than this against the card barely shows. */
export const FAINT_LIMIT = 2

export interface ColorItem {
  key: string
  label: string
  color: string
  /** Set by the user (only these are checked; the defaults are known to pass). */
  custom: boolean
}

export type ColorIssue =
  | { key: string; kind: 'faint' }
  | { key: string; kind: 'same' | 'similar' | 'cvd'; other: string }

/**
 * Problems with the user's colours: too faint on the card, or — when the
 * marks must be told apart (series, slices) — too close to another mark,
 * for everyone or for red–green colour-blind readers.
 */
export function checkColors(items: ColorItem[], surface: string, distinguish: boolean): ColorIssue[] {
  const issues: ColorIssue[] = []
  for (const item of items) {
    if (!item.custom || !isHex(item.color)) continue
    if (contrast(item.color, surface) < FAINT_LIMIT) {
      issues.push({ key: item.key, kind: 'faint' })
      continue
    }
    if (!distinguish) continue
    for (const other of items) {
      if (other.key === item.key || !isHex(other.color)) continue
      // Report a pair once, on the custom colour (or the first of two).
      if (other.custom && items.indexOf(other) < items.indexOf(item)) continue
      const kind =
        other.color.toLowerCase() === item.color.toLowerCase()
          ? 'same'
          : deltaE(item.color, other.color) < SIMILAR_LIMIT
            ? 'similar'
            : cvdDelta(item.color, other.color) < CVD_LIMIT
              ? 'cvd'
              : null
      if (kind) {
        issues.push({ key: item.key, kind, other: other.label })
        break
      }
    }
  }
  return issues
}

/**
 * The nearest colour to `color` (same hue and chroma, lightness moved as
 * little as possible) that clears every check against `others`; null when
 * no lightness works.
 */
export function fixColor(color: string, others: string[], surface: string, distinguish: boolean): string | null {
  const { l, c, h } = toOklch(color)
  const candidates: number[] = []
  for (let step = 0; step <= 60; step++) {
    for (const sign of step ? [-1, 1] : [1]) {
      const candidate = l + sign * step * 0.01
      if (candidate >= 0.25 && candidate <= 0.9) candidates.push(candidate)
    }
  }
  for (const candidate of candidates) {
    const hex = fromOklch(candidate, c, h)
    if (contrast(hex, surface) < FAINT_LIMIT) continue
    if (distinguish && others.some((other) => isHex(other) && (deltaE(hex, other) < SIMILAR_LIMIT || cvdDelta(hex, other) < CVD_LIMIT))) continue
    return hex
  }
  return null
}
