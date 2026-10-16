import { describe, expect, it } from 'vitest'
import { parseDocument, serializeMap } from '../mindmap/document'
import { NODE_SHAPES } from '../mindmap/types'
import { OUTLINE_SHAPES, outlinePath, previewParts } from './nodeShapes'
import { TEMPLATES, applyTemplateLook, createMapFromTemplate, templateOutline, templateShapes } from './templates'

describe('shape geometry', () => {
  it('draws a closed outline sized to the topic for every outline shape', () => {
    for (const shape of OUTLINE_SHAPES) {
      const d = outlinePath(shape, 120, 36)
      expect(d, shape).toMatch(/^M /)
      expect(d, shape).toMatch(/Z$/)
      const numbers = d.match(/-?\d+(\.\d+)?/g)!.map(Number)
      expect(Math.max(...numbers), shape).toBeLessThanOrEqual(120)
      expect(Math.min(...numbers), shape).toBeGreaterThanOrEqual(0)
    }
  })

  it('mirrors sided shapes for topics on the left', () => {
    expect(outlinePath('flag', 100, 30, true)).not.toBe(outlinePath('flag', 100, 30))
    expect(outlinePath('tag', 100, 30, true)).not.toBe(outlinePath('tag', 100, 30))
    expect(outlinePath('diamond', 100, 30, true)).toBe(outlinePath('diamond', 100, 30))
    // The flag's notch moves to the other side: x of the notch tip is mirrored.
    expect(outlinePath('flag', 100, 30)).toContain('L 86 15')
    expect(outlinePath('flag', 100, 30, true)).toContain('L 14 15')
  })

  it('adds more cloud bumps on wider topics', () => {
    const arcs = (w: number) => (outlinePath('cloud', w, 40).match(/A /g) ?? []).length
    expect(arcs(300)).toBeGreaterThan(arcs(100))
  })

  it('has a preview for every shape', () => {
    for (const shape of NODE_SHAPES) expect(previewParts(shape, 36, 20).length, shape).toBeGreaterThan(0)
  })
})

describe('shapes in files', () => {
  it('keeps known shapes and drops unknown ones', () => {
    const doc = (shape: unknown) =>
      parseDocument(JSON.stringify({ nodeData: { id: 'r', topic: 'r', children: [{ id: 'a', topic: 'a', shape }] } }))
    expect(doc('cloud').map.nodeData.children![0].shape).toBe('cloud')
    expect(doc('star').map.nodeData.children![0].shape).toBeUndefined()
  })
})

describe('templates with shapes', () => {
  it('together show every shape', () => {
    const used = new Set(TEMPLATES.flatMap(templateShapes))
    for (const shape of NODE_SHAPES) expect(used.has(shape), shape).toBe(true)
  })

  it('give shapes by level, with per-topic exceptions', () => {
    const process = TEMPLATES.find((t) => t.id === 'process')!
    const map = createMapFromTemplate(process, 'zh-CN')
    expect(map.nodeData.shape).toBe('chamfer')
    expect(map.nodeData.children![0].shape).toBe('chamfer')
    const check = map.nodeData.children![1].children![0]
    expect(check.topic).toBe('是否通过？')
    expect(check.shape).toBe('diamond')
    expect(parseDocument(serializeMap(map)).map).toEqual(map)
  })

  it('pour another outline into a template look, keeping shapes already set', () => {
    const trip = TEMPLATES.find((t) => t.id === 'trip')!
    const own = { nodeData: { id: 'r', topic: 'Paris', children: [{ id: 'a', topic: 'Day 1', children: [{ id: 'b', topic: 'Louvre' }] }, { id: 'c', topic: 'Notes', shape: 'note' as const }] } }
    const styled = applyTemplateLook(own, trip)
    expect(styled.nodeData.shape).toBe('ticket')
    expect(styled.nodeData.children![0].shape).toBe('flag')
    expect(styled.nodeData.children![0].children![0].shape).toBe('tag')
    expect(styled.nodeData.children![1].shape).toBe('note')
    expect(styled.theme?.name).toBe('sunset')
    expect(own.nodeData.children[0]).not.toHaveProperty('shape')
  })

  it('outline the template structure as Markdown', () => {
    const outline = templateOutline(TEMPLATES.find((t) => t.id === 'trip')!, 'en')
    expect(outline.startsWith('# Tokyo in 5 days\n')).toBe(true)
    expect(outline).toContain('  - Day 1 · Asakusa')
  })
})
