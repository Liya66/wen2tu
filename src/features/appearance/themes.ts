import type { MapTheme, ThemeVar } from '../mindmap/types'

interface ThemeColors {
  type: 'light' | 'dark'
  background: string
  /** Text of second-level and deeper topics. */
  text: string
  rootText: string
  rootFill: string
  /** Text and outline of first-level topics. */
  mainText: string
  mainFill: string
  selected: string
  accent: string
  palette: string[]
  mainRadius?: string
  rootRadius?: string
}

/** Expands a handful of colors into the CSS variables Mind Elixir reads. */
function makeTheme(name: string, colors: ThemeColors): MapTheme {
  const dark = colors.type === 'dark'
  const cssVar: Partial<Record<ThemeVar, string>> = {
    '--bgcolor': colors.background,
    '--color': colors.text,
    '--main-color': colors.mainText,
    '--main-bgcolor': colors.mainFill,
    '--main-bgcolor-transparent': dark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.8)',
    '--main-radius': colors.mainRadius ?? '20px',
    '--root-color': colors.rootText,
    '--root-bgcolor': colors.rootFill,
    '--root-border-color': 'rgba(0, 0, 0, 0)',
    '--root-radius': colors.rootRadius ?? '30px',
    '--selected': colors.selected,
    '--accent-color': colors.accent,
    '--panel-color': dark ? '#f2f2f7' : '#3a3a44',
    '--panel-bgcolor': dark ? '#2c2c34' : '#ffffff',
    '--panel-border-color': dark ? '#45454f' : '#eaeaea',
  }
  return { name, type: colors.type, palette: colors.palette, cssVar }
}

export interface ThemePreset {
  id: string
  theme: MapTheme
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    // The logo's colors: ink outlines, blossom pink, carrot, leaf and pebble gray.
    id: 'bunny',
    theme: makeTheme('bunny', {
      type: 'light',
      background: '#fdfaf5',
      text: '#4a4b55',
      rootText: '#ffffff',
      rootFill: '#2c2d35',
      mainText: '#2c2d35',
      mainFill: '#ffffff',
      selected: '#ff9341',
      accent: '#fc9e9f',
      palette: ['#2c2d35', '#fc9e9f', '#ff9341', '#77b26c', '#a7a6a9', '#e46f70', '#e57a2c', '#5f9a55'],
      mainRadius: '16px',
    }),
  },
  {
    id: 'bunny-night',
    theme: makeTheme('bunny-night', {
      type: 'dark',
      background: '#1f2027',
      text: '#d9d6dd',
      rootText: '#2c2d35',
      rootFill: '#fdeccd',
      mainText: '#f6f1ea',
      mainFill: '#2a2b33',
      selected: '#ff9e57',
      accent: '#fc9e9f',
      palette: ['#fc9e9f', '#ff9e57', '#8cc782', '#c9c7cc', '#fdb5a0', '#fdeccd', '#f47f80', '#b7d9a8'],
      mainRadius: '16px',
    }),
  },
  {
    id: 'classic',
    theme: makeTheme('classic', {
      type: 'light',
      background: '#f6f6f6',
      text: '#5f5f6b',
      rootText: '#ffffff',
      rootFill: '#4c4f69',
      mainText: '#444446',
      mainFill: '#ffffff',
      selected: '#4dc4ff',
      accent: '#e64553',
      palette: ['#dd7878', '#ea76cb', '#8839ef', '#e64553', '#fe640b', '#df8e1d', '#40a02b', '#209fb5', '#1e66f5', '#7287fd'],
    }),
  },
  {
    id: 'ocean',
    theme: makeTheme('ocean', {
      type: 'light',
      background: '#f1f7fb',
      text: '#33515f',
      rootText: '#ffffff',
      rootFill: '#0f4c75',
      mainText: '#12324a',
      mainFill: '#ffffff',
      selected: '#00b4d8',
      accent: '#0077b6',
      palette: ['#0f7ea8', '#1aa3a3', '#3a86ff', '#00b4d8', '#0077b6', '#2a9d8f', '#5e60ce', '#48cae4'],
    }),
  },
  {
    id: 'forest',
    theme: makeTheme('forest', {
      type: 'light',
      background: '#f4f6ef',
      text: '#4a5a3c',
      rootText: '#ffffff',
      rootFill: '#2d5a27',
      mainText: '#29402a',
      mainFill: '#fbfcf8',
      selected: '#74a12e',
      accent: '#bc6c25',
      palette: ['#2d6a4f', '#40916c', '#74a12e', '#6a994e', '#bc6c25', '#386641', '#a3842c', '#52796f'],
    }),
  },
  {
    id: 'sunset',
    theme: makeTheme('sunset', {
      type: 'light',
      background: '#fff7f0',
      text: '#6b4636',
      rootText: '#ffffff',
      rootFill: '#c2410c',
      mainText: '#7c2d12',
      mainFill: '#ffffff',
      selected: '#fb923c',
      accent: '#e11d48',
      palette: ['#f97316', '#ef4444', '#ec4899', '#a855f7', '#f59e0b', '#e11d48', '#d946ef', '#ea580c'],
    }),
  },
  {
    id: 'sakura',
    theme: makeTheme('sakura', {
      type: 'light',
      background: '#fff5f8',
      text: '#6d4b5c',
      rootText: '#ffffff',
      rootFill: '#d6457a',
      mainText: '#8a2e52',
      mainFill: '#ffffff',
      selected: '#f48fb1',
      accent: '#ba68c8',
      palette: ['#e75a8a', '#ba68c8', '#9575cd', '#f06292', '#ef7b7b', '#c37bd6', '#d6457a', '#8e7cc3'],
      mainRadius: '24px',
    }),
  },
  {
    id: 'macaron',
    theme: makeTheme('macaron', {
      type: 'light',
      background: '#fffdf7',
      text: '#5a5560',
      rootText: '#ffffff',
      rootFill: '#7c73e6',
      mainText: '#4a4458',
      mainFill: '#ffffff',
      selected: '#7fc8f8',
      accent: '#f4978e',
      palette: ['#f4978e', '#f6bd60', '#84a59d', '#90be6d', '#7fc8f8', '#b8b8ff', '#e5989b', '#9bc1bc'],
    }),
  },
  {
    id: 'mono',
    theme: makeTheme('mono', {
      type: 'light',
      background: '#ffffff',
      text: '#3a3a3a',
      rootText: '#ffffff',
      rootFill: '#111111',
      mainText: '#111111',
      mainFill: '#ffffff',
      selected: '#888888',
      accent: '#111111',
      palette: ['#222222', '#555555', '#777777', '#999999', '#333333', '#666666', '#444444', '#888888'],
      mainRadius: '4px',
      rootRadius: '6px',
    }),
  },
  {
    id: 'midnight',
    theme: makeTheme('midnight', {
      type: 'dark',
      background: '#0f172a',
      text: '#cbd5e1',
      rootText: '#ffffff',
      rootFill: '#6366f1',
      mainText: '#e2e8f0',
      mainFill: '#1e293b',
      selected: '#38bdf8',
      accent: '#f472b6',
      palette: ['#38bdf8', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#fb7185', '#22d3ee', '#c084fc'],
    }),
  },
  {
    id: 'graphite',
    theme: makeTheme('graphite', {
      type: 'dark',
      background: '#1c1c1e',
      text: '#c7c7cc',
      rootText: '#1c1c1e',
      rootFill: '#f5f5f7',
      mainText: '#f5f5f7',
      mainFill: '#2c2c2e',
      selected: '#64d2ff',
      accent: '#ffd60a',
      palette: ['#64d2ff', '#ffd60a', '#ff9f0a', '#30d158', '#bf5af2', '#ff453a', '#5e5ce6', '#8e8e93'],
    }),
  },
  {
    id: 'dark',
    theme: makeTheme('dark', {
      type: 'dark',
      background: '#252526',
      text: '#cccccc',
      rootText: '#ffffff',
      rootFill: '#2d3748',
      mainText: '#ffffff',
      mainFill: '#4c4f69',
      selected: '#4dc4ff',
      accent: '#789afa',
      palette: ['#848fa0', '#748be9', '#d2f9fe', '#4145a5', '#789afa', '#706cf4', '#ef987f', '#775dd5', '#fceecf', '#da7fbc'],
    }),
  },
]

export function findPreset(id: string): MapTheme | undefined {
  return THEME_PRESETS.find((preset) => preset.id === id)?.theme
}

/** The theme used when a map follows the system (no theme saved in the file). */
export function systemTheme(prefersDark: boolean): MapTheme {
  return findPreset(prefersDark ? 'bunny-night' : 'bunny')!
}

/** Colors a user can override in the Map panel, and the variable each one sets. */
export const CUSTOM_COLOR_VARS = [
  { key: 'background', cssVar: '--bgcolor' },
  { key: 'rootFill', cssVar: '--root-bgcolor' },
  { key: 'rootText', cssVar: '--root-color' },
  { key: 'mainFill', cssVar: '--main-bgcolor' },
  { key: 'mainText', cssVar: '--main-color' },
  { key: 'text', cssVar: '--color' },
] as const satisfies ReadonlyArray<{ key: string; cssVar: ThemeVar }>

/** Returns a copy of `base` with one variable changed, marked as a custom theme. */
export function customizeTheme(base: MapTheme, cssVar: ThemeVar, value: string): MapTheme {
  return {
    ...base,
    name: 'custom',
    palette: [...base.palette],
    cssVar: { ...base.cssVar, [cssVar]: value },
  }
}

/** Returns a copy of `base` with a different branch palette. */
export function withPalette(base: MapTheme, palette: string[]): MapTheme {
  return { ...base, name: 'custom', palette: [...palette], cssVar: { ...base.cssVar } }
}

/** Hand-made light partners for dark presets. */
const LIGHT_PARTNERS: Record<string, string> = { 'bunny-night': 'bunny', dark: 'classic' }

function channels(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const value = parseInt(match[1], 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function luminance([r, g, b]: [number, number, number]): number {
  const linear = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/** WCAG contrast ratio of a color against white. */
export function contrastOnWhite(hex: string): number {
  const rgb = channels(hex)
  return rgb ? 1.05 / (luminance(rgb) + 0.05) : 1
}

/** Darkens a color just enough to reach `ratio` against white. */
export function darkenForWhite(hex: string, ratio = 3): string {
  const rgb = channels(hex)
  if (!rgb) return hex
  let current = rgb
  for (let step = 0; step < 20 && 1.05 / (luminance(current) + 0.05) < ratio; step++) {
    current = current.map((c) => Math.round(c * 0.9)) as [number, number, number]
  }
  return '#' + current.map((c) => c.toString(16).padStart(2, '0')).join('')
}

/**
 * The version of a theme to use on a white or transparent page. Light themes
 * are returned as they are. Dark presets with a designed partner use it;
 * other dark themes (including custom ones) get dark text, white topics and
 * branch colors darkened until they are visible on white.
 */
export function lightVariantOf(theme: MapTheme): MapTheme {
  if (theme.type === 'light') return theme
  const partner = LIGHT_PARTNERS[theme.name]
  if (partner) return structuredClone(findPreset(partner)!)

  const rootFill = theme.cssVar['--root-bgcolor'] ?? '#2c2d35'
  // A pale center topic (e.g. cream on a dark page) would vanish on white.
  const keepRoot = contrastOnWhite(rootFill) >= 3
  return makeTheme(`${theme.name}-light`, {
    type: 'light',
    background: '#ffffff',
    text: '#3a3a44',
    rootText: keepRoot ? (theme.cssVar['--root-color'] ?? '#ffffff') : '#ffffff',
    rootFill: keepRoot ? rootFill : '#2c2d35',
    mainText: '#2c2d35',
    mainFill: '#ffffff',
    selected: theme.cssVar['--selected'] ?? '#ff9341',
    accent: darkenForWhite(theme.cssVar['--accent-color'] ?? '#ff9341'),
    palette: theme.palette.map((color) => darkenForWhite(color)),
    mainRadius: theme.cssVar['--main-radius'],
    rootRadius: theme.cssVar['--root-radius'],
  })
}
