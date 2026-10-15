import { describe, expect, it } from 'vitest'
import { DocumentError } from '../mindmap/errors'
import type { MapNode } from '../mindmap/types'
import { exportMarkdown } from './markdownExport'
import { importMarkdown } from './markdownImport'
import { importOpml } from './opmlImport'
import { detectKind, readSource } from './readSource'

/** Reduces a tree to topics only, for easy comparison. */
function outline(node: MapNode): unknown {
  return node.children ? { [node.topic]: node.children.map(outline) } : node.topic
}

describe('importMarkdown', () => {
  it('uses a single leading h1 as the root and headings as branches', () => {
    const map = importMarkdown(
      ['# 项目计划', '', '## Frontend', '- React', '  - Hooks', '- Vite', '', '## Backend', 'Plain paragraph'].join('\n'),
      'fallback',
    )
    expect(outline(map.nodeData)).toEqual({
      项目计划: [{ Frontend: [{ React: ['Hooks'] }, 'Vite'] }, { Backend: ['Plain paragraph'] }],
    })
  })

  it('falls back to the file title when there is no single h1', () => {
    const map = importMarkdown('- one\n- two', 'notes')
    expect(outline(map.nodeData)).toEqual({ notes: ['one', 'two'] })
  })

  it('attaches skipped heading levels to the nearest parent', () => {
    const map = importMarkdown('# Root\n### Deep\n## Mid\n#### Deeper', 'x')
    expect(outline(map.nodeData)).toEqual({ Root: ['Deep', { Mid: ['Deeper'] }] })
  })

  it('keeps inline text, links and task states', () => {
    const map = importMarkdown(
      '- **bold** and `code`\n- [Docs](https://example.com)\n- [x] done\n- [ ] todo\n- [bad](javascript:alert(1))',
      'x',
    )
    const [bold, link, done, todo, bad] = map.nodeData.children!
    expect(bold.topic).toBe('bold and code')
    expect(link).toMatchObject({ topic: 'Docs', hyperLink: 'https://example.com' })
    expect(done.icons).toEqual(['✅'])
    expect(todo.icons).toEqual(['⬜'])
    expect(bad.hyperLink).toBeUndefined()
  })

  it('skips code blocks, tables, quotes and raw HTML', () => {
    const map = importMarkdown('# R\n```js\nconsole.log(1)\n```\n> quote\n<div>html</div>\n\n| a |\n|---|\n| b |', 'x')
    expect(map.nodeData.children).toBeUndefined()
  })

  it('handles an empty document', () => {
    expect(outline(importMarkdown('', 'empty').nodeData)).toBe('empty')
  })
})

describe('importOpml', () => {
  const opml = (body: string, title = 'Outline') =>
    `<?xml version="1.0"?><opml version="2.0"><head><title>${title}</title></head><body>${body}</body></opml>`

  it('converts nested outlines', () => {
    const map = importOpml(
      opml('<outline text="A" _note="note"><outline text="A1"/></outline><outline title="B" url="https://example.com"/>'),
      'file',
    )
    expect(outline(map.nodeData)).toEqual({ Outline: [{ A: ['A1'] }, 'B'] })
    expect(map.nodeData.children![0].note).toBe('note')
    expect(map.nodeData.children![1].hyperLink).toBe('https://example.com')
  })

  it('uses a single top-level outline as the root', () => {
    const map = importOpml(opml('<outline text="中心"><outline text="子"/></outline>'), 'file')
    expect(outline(map.nodeData)).toEqual({ 中心: ['子'] })
  })

  it('rejects invalid XML, non-OPML documents and entity declarations', () => {
    expect(() => importOpml('<opml><body>', 'x')).toThrow(DocumentError)
    expect(() => importOpml('<html><body/></html>', 'x')).toThrow(DocumentError)
    expect(() =>
      importOpml('<?xml version="1.0"?><!DOCTYPE opml [<!ENTITY a "aaaa">]><opml><body/></opml>', 'x'),
    ).toThrow(DocumentError)
  })
})

describe('exportMarkdown', () => {
  it('writes an outline that imports back to the same tree', () => {
    const source = importMarkdown('# Root\n- A\n  - A1 [x]\n- B', 'x')
    const markdown = exportMarkdown(source)
    expect(markdown).toBe('# Root\n\n- A\n  - A1 [x]\n- B\n')
    expect(outline(importMarkdown(markdown, 'y').nodeData)).toEqual(outline(source.nodeData))
  })

  it('writes links', () => {
    const map = importMarkdown('- [Docs](https://example.com/a b)', 'R')
    expect(exportMarkdown(map)).toContain('- [Docs](')
  })
})

describe('readSource', () => {
  it('detects formats by extension', () => {
    expect(detectKind('a.mind.json')).toBe('native')
    expect(detectKind('a.JSON')).toBe('native')
    expect(detectKind('a.md')).toBe('markdown')
    expect(detectKind('a.opml')).toBe('opml')
    expect(detectKind('a.png')).toBeNull()
  })

  it('rejects unsupported files', async () => {
    await expect(readSource('photo.png', '')).rejects.toThrow(DocumentError)
  })

  it('titles imports after the file', async () => {
    expect((await readSource('学习.md', '- a')).title).toBe('学习')
  })
})
