import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import {
  addChildToRoot,
  openApp,
  rootTopic,
  trackConsoleErrors,
  useFakeFileSystem,
  useFallbackFileApi,
} from './helpers'

declare global {
  interface Window {
    __fs: {
      files: Record<string, string>
      nextOpen: string
      put(name: string, content: string): void
      externalWrite(name: string, content: string): void
    }
  }
}

const nativeFile = (topic: string, children: string[] = []) =>
  JSON.stringify({
    format: 'wen2tu',
    version: 1,
    map: {
      direction: 2,
      nodeData: { id: 'root', topic, children: children.map((c, i) => ({ id: `c${i}`, topic: c })) },
    },
  })

test('edits survive a reload without any saving', async ({ page }) => {
  const errors = trackConsoleErrors(page)
  await openApp(page)
  await expect(page.getByTestId('save-status')).toHaveText(/Draft/)

  await addChildToRoot(page, '前端 Frontend 🐰')
  // Give the recovery copy a moment to reach IndexedDB.
  await page.waitForTimeout(600)
  await page.reload()

  await expect(page.locator('me-tpc', { hasText: '前端 Frontend 🐰' })).toBeVisible()
  expect(errors).toEqual([])
})

test('switches language without touching map content, and remembers it', async ({ page }) => {
  await openApp(page)
  await addChildToRoot(page, 'Hello 你好')

  await page.getByRole('combobox', { name: 'Language' }).selectOption('zh-CN')
  await expect(page.getByRole('button', { name: /保存/ }).first()).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page.locator('me-tpc', { hasText: 'Hello 你好' })).toBeVisible()
  expect(await rootTopic(page)).toBe('Central topic')

  // The engine's context menu follows the language too.
  await expect(page.locator('#cm-add_child span').first()).toHaveText('插入子节点')

  await page.waitForTimeout(600)
  await page.reload()
  await expect(page.getByRole('combobox', { name: '语言' })).toHaveValue('zh-CN')
})

test('user text is shown as text, never as HTML', async ({ page }) => {
  let dialogOpened = false
  page.on('dialog', async (dialog) => {
    dialogOpened = true
    await dialog.dismiss()
  })
  await openApp(page)
  await addChildToRoot(page, '<img src=x onerror=alert(1)>')
  await expect(page.locator('me-tpc img')).toHaveCount(0)
  expect(dialogOpened).toBe(false)
})

test('saves to a file and opens it again (File System Access API)', async ({ page }) => {
  await useFakeFileSystem(page)
  await openApp(page)
  await addChildToRoot(page, 'Saved node')

  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByTestId('save-status')).toHaveText('Saved to Untitled map.mind.json')
  const saved = await page.evaluate(() => window.__fs.files['Untitled map.mind.json'])
  expect(JSON.parse(saved).map.nodeData.children[0].topic).toBe('Saved node')

  // Edit, then save again into the same file.
  await addChildToRoot(page, 'Second')
  await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByTestId('save-status')).toHaveText('Saved to Untitled map.mind.json')

  // Open another file, then switch back from the sidebar.
  await page.evaluate((text) => {
    window.__fs.put('other.mind.json', text)
    window.__fs.nextOpen = 'other.mind.json'
  }, nativeFile('Other map', ['x']))
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(page.locator('me-root me-tpc')).toHaveText('Other map')
  await page.getByRole('button', { name: /^Untitled map/ }).click()
  await expect(page.locator('me-tpc', { hasText: 'Second' })).toBeVisible()
})

test('asks before overwriting a file changed by another program', async ({ page }) => {
  await useFakeFileSystem(page)
  await openApp(page)
  await page.evaluate((text) => {
    window.__fs.put('shared.mind.json', text)
    window.__fs.nextOpen = 'shared.mind.json'
  }, nativeFile('Shared'))
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(page.locator('me-root me-tpc')).toHaveText('Shared')

  await page.evaluate((text) => window.__fs.externalWrite('shared.mind.json', text), nativeFile('Changed elsewhere'))
  await addChildToRoot(page, 'Mine')
  await page.keyboard.press('ControlOrMeta+s')

  const dialog = page.getByRole('dialog', { name: 'File changed on disk' })
  await expect(dialog).toBeVisible()
  expect(JSON.parse(await page.evaluate(() => window.__fs.files['shared.mind.json'])).map.nodeData.topic).toBe(
    'Changed elsewhere',
  )
  await dialog.getByRole('button', { name: 'Overwrite' }).click()
  await expect(page.getByTestId('save-status')).toHaveText('Saved to shared.mind.json')
})

test.describe('browsers without direct file access', () => {
  test.beforeEach(async ({ page }) => {
    await useFallbackFileApi(page)
  })

  test('saving downloads a copy and says so', async ({ page }) => {
    await openApp(page)
    await addChildToRoot(page, 'Downloaded node')
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('Untitled map.mind.json')
    const content = JSON.parse(await readFile(await download.path(), 'utf8'))
    expect(content.map.nodeData.children[0].topic).toBe('Downloaded node')
    await expect(page.getByTestId('notice-downloaded')).toBeVisible()
    await expect(page.getByTestId('save-status')).toHaveText('Matches the downloaded copy')
  })

  test('a broken file shows an error and keeps the current map', async ({ page }) => {
    await openApp(page)
    await addChildToRoot(page, 'Keep me')
    const chooserPromise = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Open', exact: true }).click()
    const chooser = await chooserPromise
    await chooser.setFiles({ name: 'broken.mind.json', mimeType: 'application/json', buffer: Buffer.from('{"format":') })
    await expect(page.getByTestId('notice-error')).toContainText('not valid JSON')
    await expect(page.locator('me-tpc', { hasText: 'Keep me' })).toBeVisible()
  })

  test('imports Markdown and OPML as new maps', async ({ page }) => {
    await openApp(page)

    let chooserPromise = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import', exact: true }).click()
    let chooser = await chooserPromise
    await chooser.setFiles({
      name: 'plan.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# 学习计划\n\n## 数学\n- 线性代数\n- [x] 微积分\n\n## English\n- Reading'),
    })
    await expect(page.locator('me-root me-tpc')).toHaveText('学习计划')
    await expect(page.locator('me-tpc', { hasText: '线性代数' })).toBeVisible()
    await expect(page.getByTestId('notice-imported')).toBeVisible()

    chooserPromise = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import', exact: true }).click()
    chooser = await chooserPromise
    await chooser.setFiles({
      name: 'outline.opml',
      mimeType: 'text/x-opml',
      buffer: Buffer.from('<opml version="2.0"><body><outline text="Root"><outline text="Child"/></outline></body></opml>'),
    })
    await expect(page.locator('me-root me-tpc')).toHaveText('Root')
    await expect(page.getByRole('button', { name: /^plan/ })).toBeVisible()
  })
})

test('exports PNG and SVG images', async ({ page }) => {
  const errors = trackConsoleErrors(page)
  await openApp(page)
  await addChildToRoot(page, '导出 Export')

  for (const [label, extension] of [
    ['PNG image', 'png'],
    ['SVG image', 'svg'],
  ] as const) {
    await page.getByRole('button', { name: 'Export' }).click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: label }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe(`Untitled map.${extension}`)
    const bytes = await readFile(await download.path())
    expect(bytes.length).toBeGreaterThan(1000)
    if (extension === 'svg') expect(bytes.toString('utf8')).toContain('导出 Export')
  }
  expect(errors).toEqual([])
})

test('fits a phone screen without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 })
  await openApp(page)
  await addChildToRoot(page, 'A fairly long node title that makes the map wider than the screen')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
