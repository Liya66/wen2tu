import { describe, expect, it } from 'vitest'
import {
  createDocument,
  createMap,
  fileNameForTitle,
  parseDocument,
  serializeDocument,
  serializeMap,
  titleFromFileName,
} from './document'
import { DocumentError } from './errors'
import { LIMITS } from './schema'

function expectCode(fn: () => unknown, code: string) {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(DocumentError)
    expect((error as DocumentError).code).toBe(code)
    return
  }
  throw new Error(`expected DocumentError ${code}`)
}

const sample = {
  format: 'wen2tu',
  version: 1,
  map: {
    direction: 2,
    nodeData: {
      id: 'root',
      topic: '项目 Project 🐰',
      children: [
        { id: 'a', topic: 'Frontend', expanded: false, children: [{ id: 'a1', topic: 'React' }] },
        { id: 'b', topic: 'Backend "quotes" & <tags>', tags: ['api'], icons: ['🚀'], note: '备注' },
      ],
    },
    arrows: [{ id: 'x', label: 'depends', from: 'a1', to: 'b' }],
    summaries: [{ id: 's', label: 'all', parent: 'root', start: 0, end: 1 }],
  },
}

describe('parseDocument / serializeDocument', () => {
  it('round-trips a document including CJK, emoji and special characters', () => {
    const doc = parseDocument(JSON.stringify(sample))
    const again = parseDocument(serializeDocument(doc))
    expect(again).toEqual(doc)
    expect(again.map.nodeData.topic).toBe('项目 Project 🐰')
    expect(again.map.nodeData.children?.[1].topic).toBe('Backend "quotes" & <tags>')
    expect(again.map.nodeData.children?.[0].expanded).toBe(false)
    expect(again.map.arrows).toHaveLength(1)
    expect(again.map.summaries).toHaveLength(1)
  })

  it('creates and re-reads an empty map', () => {
    const text = serializeMap(createMap('Central topic'))
    const doc = parseDocument(text)
    expect(doc.map.nodeData.topic).toBe('Central topic')
    expect(doc.map.nodeData.children).toBeUndefined()
  })

  it('produces stable output for identical content', () => {
    const doc = parseDocument(JSON.stringify(sample))
    expect(serializeDocument(doc)).toBe(serializeDocument(parseDocument(serializeDocument(doc))))
  })

  it('rejects invalid JSON', () => {
    expectCode(() => parseDocument('{ not json'), 'invalid-json')
  })

  it('rejects JSON that is not a mind map', () => {
    expectCode(() => parseDocument('{"hello": "world"}'), 'not-a-mindmap')
    expectCode(() => parseDocument('[1, 2, 3]'), 'not-a-mindmap')
    expectCode(() => parseDocument('null'), 'not-a-mindmap')
  })

  it('rejects files from a newer version', () => {
    expectCode(() => parseDocument(JSON.stringify({ ...sample, version: 99 })), 'unsupported-version')
  })

  it('rejects documents missing required fields', () => {
    expectCode(() => parseDocument(JSON.stringify({ format: 'wen2tu', version: 1, map: {} })), 'invalid-structure')
    expectCode(
      () => parseDocument(JSON.stringify({ format: 'wen2tu', version: 1, map: { nodeData: { topic: {} } } })),
      'invalid-structure',
    )
  })

  it('accepts plain Mind Elixir exports', () => {
    const doc = parseDocument(JSON.stringify(sample.map))
    expect(doc.format).toBe('wen2tu')
    expect(doc.map.nodeData.children).toHaveLength(2)
  })

  it('rejects maps that are too deep', () => {
    let node: Record<string, unknown> = { id: 'leaf', topic: 'leaf' }
    for (let i = 0; i < LIMITS.maxDepth + 5; i++) node = { id: `n${i}`, topic: 'x', children: [node] }
    expectCode(() => parseDocument(JSON.stringify({ nodeData: node })), 'too-large')
  })
})

describe('sanitizing untrusted content', () => {
  const withNode = (node: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ format: 'wen2tu', version: 1, map: { nodeData: { id: 'r', topic: 'r', children: [node] }, ...extra } })

  it('drops raw HTML fields', () => {
    const doc = parseDocument(withNode({ id: 'a', topic: 'a', dangerouslySetInnerHTML: '<img src=x onerror=alert(1)>' }))
    expect(JSON.stringify(doc)).not.toContain('onerror')
  })

  it('only keeps safe links and images', () => {
    const doc = parseDocument(
      withNode({
        id: 'a',
        topic: 'a',
        hyperLink: 'javascript:alert(1)',
        image: { url: 'http://tracker.example/pixel.png', width: 10, height: 10 },
      }),
    )
    const node = doc.map.nodeData.children![0]
    expect(node.hyperLink).toBeUndefined()
    expect(node.image).toBeUndefined()

    const ok = parseDocument(
      withNode({ id: 'a', topic: 'a', hyperLink: 'https://example.com', image: { url: 'https://example.com/a.png', width: 1, height: 1 } }),
    )
    expect(ok.map.nodeData.children![0].hyperLink).toBe('https://example.com')
    expect(ok.map.nodeData.children![0].image?.url).toBe('https://example.com/a.png')
  })

  it('drops unsafe CSS values and unknown style keys', () => {
    const doc = parseDocument(
      withNode({
        id: 'a',
        topic: 'a',
        style: { color: 'red', background: 'url(https://tracker.example)', position: 'fixed', fontSize: 24 },
      }),
    )
    expect(doc.map.nodeData.children![0].style).toEqual({ color: 'red', fontSize: '24' })
  })

  it('regenerates duplicate ids and drops dangling arrows and summaries', () => {
    const doc = parseDocument(
      JSON.stringify({
        nodeData: { id: 'r', topic: 'r', children: [{ id: 'dup', topic: '1' }, { id: 'dup', topic: '2' }] },
        arrows: [{ id: 'x', label: '', from: 'dup', to: 'missing' }],
        summaries: [{ id: 's', label: '', parent: 'r', start: 0, end: 5 }],
      }),
    )
    const [a, b] = doc.map.nodeData.children!
    expect(a.id).not.toBe(b.id)
    expect(doc.map.arrows).toBeUndefined()
    expect(doc.map.summaries).toBeUndefined()
  })
})

describe('map shape', () => {
  it('keeps a valid shape and ignores unknown ones', () => {
    const withShape = (shape: unknown) =>
      parseDocument(JSON.stringify({ format: 'wen2tu', version: 1, map: { nodeData: { id: 'r', topic: 'r' }, shape } })).map.shape
    expect(withShape('pill')).toBe('pill')
    expect(withShape('hexagon')).toBeUndefined()
    expect(withShape(undefined)).toBeUndefined()
  })
})

describe('line settings', () => {
  it('keeps chosen values, drops defaults and unknown values', () => {
    const withLines = (lines: unknown) =>
      parseDocument(JSON.stringify({ nodeData: { id: 'r', topic: 'r' }, lines })).map.lines
    expect(withLines({ strength: 'hidden', width: 'bold', style: 'elbow' })).toEqual({ strength: 'hidden', width: 'bold', style: 'elbow' })
    expect(withLines({ strength: 'standard', width: 'standard', style: 'curve' })).toBeUndefined()
    expect(withLines({ strength: 'neon', style: 'straight' })).toEqual({ style: 'straight' })
  })
})

describe('file names', () => {
  it('derives titles from file names', () => {
    expect(titleFromFileName('plan.mind.json')).toBe('plan')
    expect(titleFromFileName('notes.md')).toBe('notes')
    expect(titleFromFileName('学习笔记.opml')).toBe('学习笔记')
    expect(titleFromFileName('README')).toBe('README')
  })

  it('builds safe native file names', () => {
    expect(fileNameForTitle('My: plan/2026?')).toBe('My_ plan_2026_.mind.json')
    expect(fileNameForTitle('   ')).toBe('mindmap.mind.json')
    expect(fileNameForTitle('学习')).toBe('学习.mind.json')
  })

  it('wraps maps in the versioned envelope', () => {
    expect(createDocument(createMap('x'))).toMatchObject({ format: 'wen2tu', version: 1 })
  })
})
