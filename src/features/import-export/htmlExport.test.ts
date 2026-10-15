import { describe, expect, it } from 'vitest'
import { createDocument, createMap, parseDocument } from '../mindmap/document'
import { buildHtml, embedJson, extractHtmlData } from './htmlExport'
import { readSource } from './readSource'

const assets = { script: 'console.log("</script> inside")', css: 'body{color:red} /* </style> */' }

function exported(topic: string) {
  const map = createMap(topic)
  map.nodeData.children = [{ id: 'c', topic: '</script><script>alert(1)</script>' }]
  return buildHtml({ doc: createDocument(map), title: `<b>${topic}</b>`, language: 'zh-CN', assets, homepage: 'https://example.com/?a=1&b=2' })
}

describe('HTML export', () => {
  it('embeds data that cannot break out of its script element', () => {
    const html = exported('Plan')
    const dataBlock = html.slice(html.indexOf('id="wen2tu-data">'), html.indexOf('</script>', html.indexOf('id="wen2tu-data">')))
    expect(dataBlock).not.toContain('<')
    expect(embedJson({ a: ' <' })).toBe('{"a":"\\u2028\\u003c"}')
  })

  it('escapes the title, attributes and inline code', () => {
    const html = exported('Plan')
    expect(html).toContain('<title>&lt;b&gt;Plan&lt;/b&gt;</title>')
    expect(html).toContain('href="https://example.com/?a=1&amp;b=2"')
    expect(html).toContain('<\\/script> inside')
    expect(html).toContain('<\\/style>')
    // Exactly two closing script tags: the data and the viewer.
    expect(html.match(/<\/script>/g)).toHaveLength(2)
  })

  it('round-trips: the data can be read back as the same map', async () => {
    const html = exported('学习 🐰')
    const data = extractHtmlData(html)!
    const doc = parseDocument(data)
    expect(doc.map.nodeData.topic).toBe('学习 🐰')
    expect(doc.map.nodeData.children?.[0].topic).toBe('</script><script>alert(1)</script>')

    const imported = await readSource('学习.html', html)
    expect(imported.kind).toBe('html')
    expect(imported.map.nodeData.topic).toBe('学习 🐰')
  })

  it('rejects HTML pages that were not exported by wen2tu', async () => {
    expect(extractHtmlData('<html><body>hello</body></html>')).toBeNull()
    await expect(readSource('page.html', '<html></html>')).rejects.toThrow()
  })
})
