/**
 * The quiet chart theme: one muted slate hue, recessive hairline axes, no
 * ticks, muted labels.
 *
 * Colour rules (applied in buildOption):
 * - one series: the accent;
 * - ordered series (years, quarters, age bands) and stacks: up to 5 steps
 *   of the ramp, which reads light→dark in order;
 * - unordered lines: the largest in the accent, the rest in gray, each
 *   named at its end;
 * - more groups than that: small multiples, one panel per group.
 * The ramp passes the ordinal checks (one hue, monotone lightness, visible
 * steps, light end ≥ 2:1) on wen2tu's light and dark card surfaces.
 */
import { paletteFromHue } from './colorMath'

export interface ChartColors {
  mode: 'light' | 'dark'
  surface: string
  text: string
  textMuted: string
  axis: string
  grid: string
  border: string
  /** Five steps, least to most prominent: light→dark on light surfaces, dark→light on dark ones. */
  ramp: string[]
  /** The colour of a single series and of the highlighted line. */
  accent: string
  /** Lines that give context to the highlighted one. */
  context: string
  /** Heatmaps: from near the surface (low) to the most prominent step (high). */
  sequential: string[]
}

export const LIGHT: ChartColors = {
  mode: 'light',
  surface: '#ffffff',
  text: '#2c2d35',
  textMuted: '#6b6a72',
  axis: '#cfc8bc',
  grid: '#efe9df',
  border: '#ece4d8',
  context: '#bab5ad',
  // Muted slate: OKLCH hue 250, chroma 0.07 (the "slate" palette in style.ts).
  ...paletteFromHue(250, 0.07, 'light'),
}

export const DARK: ChartColors = {
  mode: 'dark',
  surface: '#2a2b33',
  text: '#f6f1ea',
  textMuted: '#b0aeb7',
  axis: '#4a4b55',
  grid: '#363741',
  border: '#3b3c46',
  context: '#5a5b66',
  ...paletteFromHue(250, 0.07, 'dark'),
}

export const FONT =
  "system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"

export const THEME_NAME = { light: 'data2tu-light', dark: 'data2tu-dark' } as const

/** An ECharts theme object: everything that is the same for every chart. */
export function echartsTheme(c: ChartColors): object {
  const axisCommon = {
    axisLine: { show: true, lineStyle: { color: c.axis, width: 1 } },
    axisTick: { show: false },
    axisLabel: { color: c.textMuted, fontSize: 12, hideOverlap: true },
    splitLine: { show: false },
    nameTextStyle: { color: c.textMuted, fontSize: 12 },
  }
  return {
    color: [c.accent],
    backgroundColor: 'transparent',
    textStyle: { fontFamily: FONT, color: c.text },
    categoryAxis: axisCommon,
    timeAxis: { ...axisCommon, splitLine: { show: false } },
    valueAxis: {
      ...axisCommon,
      axisLine: { show: false },
      splitLine: { show: true, lineStyle: { color: c.grid, width: 1, type: 'solid' } },
    },
    legend: {
      textStyle: { color: c.textMuted, fontSize: 12 },
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 14,
      pageIconColor: c.textMuted,
      pageTextStyle: { color: c.textMuted },
    },
    tooltip: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
      textStyle: { color: c.text, fontSize: 12 },
      extraCssText: `box-shadow: 0 6px 20px rgb(0 0 0 / ${c.mode === 'dark' ? 40 : 12}%); border-radius: 8px;`,
      axisPointer: { lineStyle: { color: c.axis }, crossStyle: { color: c.axis }, shadowStyle: { color: c.mode === 'dark' ? 'rgb(255 255 255 / 4%)' : 'rgb(44 45 53 / 4%)' } },
    },
    line: { symbol: 'circle', symbolSize: 7, lineStyle: { width: 2, cap: 'round', join: 'round' }, smooth: false },
    bar: { barMaxWidth: 24 },
    scatter: { symbolSize: 10 },
    visualMap: { textStyle: { color: c.textMuted } },
  }
}
