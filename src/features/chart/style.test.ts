import { describe, expect, it } from 'vitest'
import { buildChart, type BuildContext, type Swatch } from './buildOption'
import { checkColors, contrast, cvdDelta, deltaE, fixColor, paletteFromHue, toOklch } from './colorMath'
import { tableToCsv } from './exportChart'
import { FIXTURES } from './fixtures'
import { recommend } from './recommend'
import { DEFAULT_STYLE, PALETTES, type ChartStyle } from './style'
import { analyzeText } from './table'
import { DARK, LIGHT } from './theme'

const labels = { other: '其他', value: '数值', period: '时间', points: '点' }

function chart(id: string, style: Partial<ChartStyle> = {}, colors = LIGHT, lang: BuildContext['lang'] = 'zh-CN') {
  const table = analyzeText(FIXTURES.find((f) => f.id === id)!.text)!
  const rec = recommend(table)[0]
  return { table, rec, built: buildChart(rec, table, { lang, colors, labels, width: 800, style: { ...DEFAULT_STYLE, ...style } }) }
}

describe('palettes', () => {
  it.each(PALETTES.flatMap((p) => (['light', 'dark'] as const).map((mode) => [p.id, mode, p] as const)))(
    '%s (%s) reads as an ordered ramp',
    (_, mode, preset) => {
      const { ramp } = paletteFromHue(preset.hue, preset.chroma, mode)
      const surface = mode === 'light' ? LIGHT.surface : DARK.surface
      const lightness = ramp.map((color) => toOklch(color).l)
      // Monotone, with every step visible (ΔL ≥ 0.06), and the faintest step at least 2:1 on the card.
      for (let i = 1; i < lightness.length; i++) {
        const step = mode === 'light' ? lightness[i - 1] - lightness[i] : lightness[i] - lightness[i - 1]
        expect(step).toBeGreaterThanOrEqual(0.06)
      }
      expect(contrast(ramp[0], surface)).toBeGreaterThanOrEqual(2)
    },
  )

  it('generates the validated slate ramp exactly', () => {
    expect(paletteFromHue(250, 0.07, 'light').ramp).toEqual(['#90b5dc', '#7196bc', '#54789c', '#385b7e', '#1d3f60'])
    expect(LIGHT.ramp).toEqual(paletteFromHue(250, 0.07, 'light').ramp)
  })
})

describe('colour checks', () => {
  const item = (key: string, color: string, custom = true) => ({ key, label: key, color, custom })

  it('flags custom colours that are too faint, the same, or too close', () => {
    const issues = checkColors(
      [item('a', '#f4f4f4'), item('b', '#385b7e', false), item('c', '#385b7e'), item('d', '#3a5d80')],
      LIGHT.surface,
      true,
    )
    expect(issues).toEqual([
      { key: 'a', kind: 'faint' },
      { key: 'c', kind: 'same', other: 'b' },
      { key: 'd', kind: 'similar', other: 'b' },
    ])
  })

  it('flags pairs only red–green colour-blind readers would confuse', () => {
    // A red and a green of similar lightness: distinct for most people, not for deuteranopes.
    const [red, green] = ['#c0504d', '#6f8f3a']
    expect(deltaE(red, green)).toBeGreaterThan(8)
    expect(cvdDelta(red, green)).toBeLessThan(6)
    expect(checkColors([item('red', red), item('green', green, false)], LIGHT.surface, true)).toEqual([{ key: 'red', kind: 'cvd', other: 'green' }])
  })

  it('does not ask bars of one series to differ from each other', () => {
    expect(checkColors([item('a', '#385b7e'), item('b', '#385b7e', false)], LIGHT.surface, false)).toEqual([])
  })

  it('fixes a colour by moving its lightness until every check passes', () => {
    const fixed = fixColor('#3a5d80', ['#385b7e'], LIGHT.surface, true)!
    expect(deltaE(fixed, '#385b7e')).toBeGreaterThanOrEqual(8)
    expect(cvdDelta(fixed, '#385b7e')).toBeGreaterThanOrEqual(6)
    expect(Math.abs(toOklch(fixed).h - toOklch('#3a5d80').h)).toBeLessThan(3)
    expect(contrast(fixColor('#fafafa', [], LIGHT.surface, false)!, LIGHT.surface)).toBeGreaterThanOrEqual(2)
  })
})

describe('chart style', () => {
  type Series = { name: string; color?: string; data: unknown[]; label?: { show: boolean } }

  it('repaints every default colour from the chosen palette', () => {
    const carrot = paletteFromHue(50, 0.1, 'light')
    const { built } = chart('ai-markdown-year-compare', { palette: 'carrot' })
    expect((built.option.series as Series[]).map((s) => s.color)).toEqual([carrot.ramp[1], carrot.ramp[3]])
  })

  it('applies a custom colour by series name, and reports it as a swatch', () => {
    const { built } = chart('csv-quarterly-long', { colors: { Tablet: '#c0504d' } }, LIGHT, 'en')
    const tablet = (built.option.series as Series[]).find((s) => s.name === 'Tablet')!
    expect(tablet.color).toBe('#c0504d')
    expect(built.swatches).toContainEqual<Swatch>({ key: 'Tablet', color: '#c0504d', custom: true })
    expect(built.distinguish).toBe(true)
  })

  it('colours single bars by category', () => {
    const { built } = chart('ai-markdown-city-gdp', { colors: { 深圳: '#c0504d' } })
    const data = (built.option.series as Series[])[0].data
    expect(data).toContainEqual({ value: 34606.4e8, itemStyle: { color: '#c0504d' } })
    expect(built.distinguish).toBe(false)
  })

  it('adds a title, hides gridlines and turns bars sideways on request', () => {
    const { built } = chart('ai-markdown-city-gdp', { title: '城市 GDP', grid: false, orientation: 'horizontal' })
    const option = built.option as { title: { text: string }; xAxis: { type: string; splitLine: { show: boolean } }; yAxis: { type: string } }
    expect(option.title.text).toBe('城市 GDP')
    expect(option.xAxis).toMatchObject({ type: 'value', splitLine: { show: false } })
    expect(option.yAxis.type).toBe('category')
  })

  it('keeps the pasted order of categories on request', () => {
    // Pasted third: "Unclear ownership…" (201); by value it would be fifth.
    const third = (style: Partial<ChartStyle>) => (chart('csv-survey-long-labels', style).built.option.yAxis as { data: string[] }).data[2]
    expect(third({})).toMatch(/^Notifications/)
    expect(third({ sort: 'original' })).toMatch(/^Unclear/)
  })

  it('writes every digit when numbers are set to full', () => {
    const { built } = chart('ai-markdown-city-gdp', { numbers: 'full' })
    const axis = (built.option.yAxis as { axisLabel: { formatter: (v: number) => string } }).axisLabel
    expect(axis.formatter(4.72e12)).toBe('4,720,000,000,000')
  })

  it('hides or shows value labels on request', () => {
    const none = chart('ai-markdown-city-gdp', { labels: 'none' }).built.option.series as Series[]
    expect(none[0].label).toBeUndefined()
    const all = chart('excel-channel-mix', { labels: 'all' }).built.option.series as Series[]
    expect(all.every((s) => s.label?.show)).toBe(true)
  })
})

describe('CSV export', () => {
  it('writes plain numbers, ISO dates and a BOM for Excel', () => {
    const table = analyzeText(FIXTURES.find((f) => f.id === 'excel-monthly-sales')!.text)!
    const [header, first] = tableToCsv(table, labels).split('\r\n')
    expect(header).toBe('﻿月份,销售额,订单数')
    expect(first).toBe('2024-01,1234500,3210')
  })

  it('keeps periods without a year as written, and percentages as percentages', () => {
    const table = analyzeText(FIXTURES.find((f) => f.id === 'excel-wide-region-month')!.text)!
    expect(tableToCsv(table, labels).split('\r\n')[1]).toBe('华东,1月,1253000')
    const share = analyzeText(FIXTURES.find((f) => f.id === 'ai-markdown-share')!.text)!
    expect(tableToCsv(share, labels).split('\r\n')[1]).toBe('Organic search,42.5%')
  })
})
