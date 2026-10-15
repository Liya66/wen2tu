import { describe, expect, it } from 'vitest'
import { parseDocument, serializeMap } from '../mindmap/document'
import type { MapNode } from '../mindmap/types'
import { CLEAR_STYLE, lookToStyle, mergeLook, readLook, readableTextOn, toHexColor } from './nodeStyles'
import { TEMPLATES, createMapFromTemplate } from './templates'
import {
  THEME_PRESETS,
  contrastOnWhite,
  customizeTheme,
  darkenForWhite,
  findPreset,
  lightVariantOf,
  systemTheme,
  withPalette,
} from './themes'

describe('themes', () => {
  it('every preset survives saving and loading unchanged', () => {
    for (const { theme } of THEME_PRESETS) {
      const text = serializeMap({ nodeData: { id: 'r', topic: 'r' }, theme })
      expect(parseDocument(text).map.theme).toEqual(theme)
    }
  })

  it('maps without a theme follow the system', () => {
    expect(systemTheme(false).name).toBe('bunny')
    expect(systemTheme(true).name).toBe('bunny-night')
    expect(parseDocument(serializeMap({ nodeData: { id: 'r', topic: 'r' } })).map.theme).toBeUndefined()
  })

  it('drops unknown variables and unsafe values from saved themes', () => {
    const text = JSON.stringify({
      nodeData: { id: 'r', topic: 'r' },
      theme: {
        name: 'evil',
        type: 'light',
        palette: ['#fff', 'url(https://tracker.example)'],
        cssVar: { '--bgcolor': 'red', '--root-bgcolor': 'url(https://tracker.example)', '--anything': 'blue' },
      },
    })
    expect(parseDocument(text).map.theme).toEqual({
      name: 'evil',
      type: 'light',
      palette: ['#fff'],
      cssVar: { '--bgcolor': 'red' },
    })
  })

  it('customizing creates a separate custom theme', () => {
    const base = findPreset('ocean')!
    const custom = customizeTheme(base, '--bgcolor', '#000000')
    expect(custom.name).toBe('custom')
    expect(custom.cssVar['--bgcolor']).toBe('#000000')
    expect(base.cssVar['--bgcolor']).not.toBe('#000000')
    expect(withPalette(base, ['#111111']).palette).toEqual(['#111111'])
  })
})

describe('node looks', () => {
  it('round-trips every control through a stored style', () => {
    const look = mergeLook(readLook(), {
      shape: 'square',
      border: 'full',
      borderWidth: 3,
      borderStyle: 'dashed',
      borderColor: '#ff0000',
      fill: 'solid',
      fillColor: '#123456',
      fontSize: '24',
      bold: true,
      italic: true,
      strike: true,
    })
    const style = Object.fromEntries(Object.entries(lookToStyle(look, 2)).filter(([, v]) => v)) as MapNode['style']
    expect(style).toMatchObject({ border: '3px dashed #ff0000', borderRadius: '0px', background: '#123456' })
    expect(readLook(style)).toEqual(look)
  })

  it('keeps boxed deeper topics padded and clears padding otherwise', () => {
    expect(lookToStyle(mergeLook(readLook(), { fill: 'solid' }), 3).padding).toBe('4px 10px')
    expect(lookToStyle(readLook(), 3).padding).toBe('')
    expect(lookToStyle(mergeLook(readLook(), { fill: 'solid' }), 1).padding).toBeUndefined()
  })

  it('underline uses only the bottom border', () => {
    const style = lookToStyle(mergeLook(readLook(), { border: 'underline' }), 2)
    expect(style.border).toBe('none')
    expect(style.borderBottom).toMatch(/^2px solid /)
  })

  it('picks readable text for fills unless the user chose a text color', () => {
    expect(readableTextOn('#fff3bf')).toBe('#1f2937')
    expect(readableTextOn('#1e293b')).toBe('#ffffff')
    expect(mergeLook(readLook(), { fill: 'solid', fillColor: '#000000' }).textColor).toBe('#ffffff')
    const manual = readLook({ color: '#ff0000' })
    expect(mergeLook(manual, { fill: 'solid', fillColor: '#000000' }).textColor).toBe('#ff0000')
    const filled = readLook({ background: '#000000', color: '#ffffff' })
    expect(mergeLook(filled, { fill: 'none' }).textColor).toBeUndefined()
  })

  it('clearing removes every property the panel controls', () => {
    expect(Object.values(CLEAR_STYLE).every((v) => v === '')).toBe(true)
  })

  it('normalizes colors for the color picker', () => {
    expect(toHexColor('#ABC')).toBe('#aabbcc')
    expect(toHexColor('rgb(255, 0, 16)')).toBe('#ff0010')
    expect(toHexColor('rgba(0,0,0,0.5)')).toBe('#000000')
    expect(toHexColor(undefined, '#123456')).toBe('#123456')
    expect(toHexColor('red', '#123456')).toBe('#123456')
  })

  it('stored styles survive the file sanitizer', () => {
    const style = lookToStyle(mergeLook(readLook(), { border: 'full', fill: 'solid', shape: 'pill', italic: true }), 2)
    const nodeStyle = Object.fromEntries(Object.entries(style).filter(([, v]) => v))
    const doc = parseDocument(serializeMap({ nodeData: { id: 'r', topic: 'r', children: [{ id: 'a', topic: 'a', style: nodeStyle }] } }))
    expect(doc.map.nodeData.children![0].style).toEqual(nodeStyle)
  })
})

describe('templates', () => {
  it('build valid maps in both languages with unique ids', () => {
    for (const template of TEMPLATES) {
      for (const language of ['en', 'zh-CN'] as const) {
        const map = createMapFromTemplate(template, language)
        const reparsed = parseDocument(serializeMap(map)).map
        expect(reparsed).toEqual(map)
        const ids: string[] = []
        const walk = (node: MapNode) => {
          ids.push(node.id)
          node.children?.forEach(walk)
        }
        walk(map.nodeData)
        expect(new Set(ids).size).toBe(ids.length)
        expect(map.theme?.name).toBe(template.theme)
      }
    }
  })

  it('creates fresh ids every time', () => {
    const template = TEMPLATES.find((t) => t.id === 'project')!
    expect(createMapFromTemplate(template, 'en').nodeData.id).not.toBe(createMapFromTemplate(template, 'en').nodeData.id)
  })
})

describe('light versions for transparent export', () => {
  it('keeps light themes and uses designed partners', () => {
    const ocean = findPreset('ocean')!
    expect(lightVariantOf(ocean)).toBe(ocean)
    expect(lightVariantOf(findPreset('bunny-night')!).name).toBe('bunny')
    expect(lightVariantOf(findPreset('dark')!).name).toBe('classic')
  })

  it('makes every dark preset readable on white', () => {
    for (const { theme } of THEME_PRESETS.filter((p) => p.theme.type === 'dark')) {
      const light = lightVariantOf(theme)
      expect(light.type, theme.name).toBe('light')
      // Generated versions darken branch colors; designed partners keep their palette.
      if (light.name.endsWith('-light')) {
        for (const color of light.palette) expect(contrastOnWhite(color), `${theme.name} ${color}`).toBeGreaterThanOrEqual(2.9)
      }
      for (const key of ['--color', '--main-color'] as const) {
        expect(contrastOnWhite(light.cssVar[key]!), `${theme.name} ${key}`).toBeGreaterThanOrEqual(4.5)
      }
      expect(contrastOnWhite(light.cssVar['--root-bgcolor']!), theme.name).toBeGreaterThanOrEqual(3)
    }
  })

  it('replaces a pale center topic and keeps a strong one', () => {
    expect(lightVariantOf(findPreset('graphite')!).cssVar['--root-bgcolor']).toBe('#2c2d35')
    expect(lightVariantOf(findPreset('midnight')!).cssVar['--root-bgcolor']).toBe('#6366f1')
  })

  it('darkens colors only as much as needed', () => {
    expect(darkenForWhite('#2c2d35')).toBe('#2c2d35')
    expect(contrastOnWhite(darkenForWhite('#fdeccd'))).toBeGreaterThanOrEqual(2.9)
  })
})

describe('welcome map', () => {
  it('is a valid map in both languages, linking to the repository', async () => {
    const { createWelcomeMap } = await import('../onboarding/welcomeMap')
    for (const language of ['en', 'zh-CN'] as const) {
      const { title, map } = createWelcomeMap(language)
      expect(title).toBeTruthy()
      expect(parseDocument(serializeMap(map)).map).toEqual(map)
      expect(JSON.stringify(map)).toContain('"hyperLink":"https://github.com/Liya66/wen2tu"')
      expect(map.nodeData.children!.length).toBeGreaterThanOrEqual(5)
    }
  })
})
