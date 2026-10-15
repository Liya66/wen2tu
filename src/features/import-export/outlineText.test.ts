import { describe, expect, it } from 'vitest'
import type { MapNode } from '../mindmap/types'
import { looksLikeOutline, outlineToMap, parseIndentedOutline, parseOutline, stripCodeFence } from './outlineText'

function outline(node: MapNode): unknown {
  return node.children ? { [node.topic]: node.children.map(outline) } : node.topic
}

describe('pasted outlines', () => {
  it('parses Markdown lists into siblings with their subtopics', async () => {
    const nodes = await parseOutline('- 前端\n  - React\n  - Vite\n- 后端\n  - Node')
    expect(nodes.map(outline)).toEqual([{ 前端: ['React', 'Vite'] }, { 后端: ['Node'] }])
  })

  it('keeps a single heading as one topic with its branches', async () => {
    const nodes = await parseOutline('# 计划\n## 目标\n- 上线')
    expect(nodes.map(outline)).toEqual([{ 计划: [{ 目标: ['上线'] }] }])
  })

  it('parses plain indented text (tabs or spaces) and drops bullet glyphs', () => {
    const nodes = parseIndentedOutline('Plan\n\tGoal\n\t\tShip it\n\tRisks\n• Notes\n    ◦ Detail')
    expect(nodes.map(outline)).toEqual([{ Plan: [{ Goal: ['Ship it'] }, 'Risks'] }, { Notes: ['Detail'] }])
  })

  it('unwraps a fenced code block copied from an AI chat', async () => {
    const text = '```markdown\n# Topic\n- a\n- b\n```'
    expect(stripCodeFence(text)).toBe('# Topic\n- a\n- b')
    expect((await parseOutline(text)).map(outline)).toEqual([{ Topic: ['a', 'b'] }])
  })

  it('sanitizes pasted content like a file', async () => {
    const [node] = await parseOutline('- [x](javascript:alert(1))\n- <img src=x onerror=alert(1)>')
    expect(node.hyperLink).toBeUndefined()
    expect(JSON.stringify(await parseOutline('- <b>bold</b>'))).not.toContain('dangerously')
  })

  it('decides what is worth turning into a map', () => {
    expect(looksLikeOutline('one line')).toBe(false)
    expect(looksLikeOutline('# Heading')).toBe(true)
    expect(looksLikeOutline('a\nb')).toBe(true)
    expect(looksLikeOutline('  \n\n')).toBe(false)
  })

  it('builds a map: one top-level topic becomes the center, several get a new one', async () => {
    const single = await outlineToMap('# 学习\n- 数学', 'Untitled')
    expect(single.title).toBe('学习')
    expect(outline(single.map.nodeData)).toEqual({ 学习: ['数学'] })
    const many = await outlineToMap('- a\n- b', 'Untitled')
    expect(many.title).toBe('Untitled')
    expect(outline(many.map.nodeData)).toEqual({ Untitled: ['a', 'b'] })
    await expect(outlineToMap('   ', 'x')).rejects.toThrow()
  })
})
