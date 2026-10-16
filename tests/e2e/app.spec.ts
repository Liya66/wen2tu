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
      lastOpenOptions: { types: Array<{ accept: Record<string, string[]> }> }
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

test('menus are fully visible and keep the toolbar in place', async ({ page }) => {
  await openApp(page)
  const newButton = page.getByRole('navigation').getByRole('button', { name: 'New', exact: true })
  const before = await newButton.boundingBox()
  await page.getByRole('button', { name: 'Export' }).click()
  const viewport = page.viewportSize()!
  for (const item of await page.getByRole('menuitem').all()) {
    await expect(item).toBeVisible()
    const box = (await item.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
  }
  expect(await newButton.boundingBox()).toEqual(before)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
})

test('Import offers .mind.json files too, and keeps them linked', async ({ page }) => {
  await useFakeFileSystem(page)
  await openApp(page)
  await page.evaluate((text) => {
    window.__fs.put('earlier.mind.json', text)
    window.__fs.nextOpen = 'earlier.mind.json'
  }, nativeFile('Earlier map', ['kept']))
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(page.locator('me-root me-tpc')).toHaveText('Earlier map')
  await expect(page.getByTestId('save-status')).toHaveText('Saved to earlier.mind.json')

  const accepted = await page.evaluate(() => window.__fs.lastOpenOptions.types.flatMap((t) => Object.values(t.accept).flat()))
  expect(accepted).toEqual(expect.arrayContaining(['.json', '.md', '.opml']))
})

test('the fallback file input accepts maps and outlines', async ({ page }) => {
  await useFallbackFileApi(page)
  await openApp(page)
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  const chooser = await chooserPromise
  const accept = await chooser.element().getAttribute('accept')
  expect(accept).toContain('.json')
  expect(accept).toContain('.md')
  await chooser.setFiles({ name: 'again.mind.json', mimeType: 'application/json', buffer: Buffer.from(nativeFile('Again')) })
  await expect(page.locator('me-root me-tpc')).toHaveText('Again')
})

test('templates, color schemes and topic styles are saved in the file', async ({ page }) => {
  await useFakeFileSystem(page)
  await openApp(page)

  await page.getByRole('navigation').getByRole('button', { name: 'New', exact: true }).click()
  await page.getByRole('menuitem', { name: 'From template…' }).click()
  await page.getByTestId('template-project').click()
  await page.getByRole('button', { name: 'Use the sample content' }).click()
  await expect(page.locator('me-root me-tpc')).toHaveText('Project plan')
  await expect(page.getByRole('button', { name: /^Project plan/ })).toBeVisible()

  await page.getByRole('button', { name: 'Style' }).click()
  const panel = page.getByRole('complementary', { name: 'Style' })
  await panel.getByRole('tab', { name: 'Map' }).click()
  await expect(panel.getByRole('button', { name: 'Ocean', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await panel.getByRole('button', { name: 'Midnight', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Midnight', exact: true })).toHaveAttribute('aria-pressed', 'true')

  // Selecting a topic switches the panel to its controls.
  const research = page.locator('me-tpc', { hasText: 'Phase 1 · Research' })
  await research.click()
  await expect(panel.getByText('1 topic selected')).toBeVisible()
  // A shape without a border gets a visible fill.
  await panel.getByRole('radio', { name: 'Pill' }).click()
  await expect(panel.getByRole('radio', { name: 'Color' })).toHaveAttribute('aria-checked', 'true')
  await expect(research).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')

  await page.locator('me-tpc', { hasText: 'Timeline' }).click()
  await panel.getByRole('radio', { name: 'Outline' }).click()
  await panel.getByRole('radio', { name: 'Square' }).click()
  await panel.getByRole('button', { name: 'Bold' }).click()
  const topic = page.locator('me-tpc', { hasText: 'Timeline' })
  await expect(topic).toHaveCSS('font-weight', '700')
  await expect(topic).toHaveCSS('border-top-style', 'solid')

  // Undo reverts the last style change only.
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(research).toHaveCSS('border-radius', '999px')
  await expect(page.locator('me-tpc', { hasText: 'Timeline' })).not.toHaveCSS('font-weight', '700')
  await page.getByRole('button', { name: 'Redo' }).click()

  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByTestId('save-status')).toHaveText('Saved to Project plan.mind.json')
  const saved = JSON.parse(await page.evaluate(() => window.__fs.files['Project plan.mind.json']))
  expect(saved.map.theme.name).toBe('midnight')
  const timeline = saved.map.nodeData.children.find((n: { topic: string }) => n.topic === 'Timeline')
  expect(timeline.style).toMatchObject({ borderRadius: '0px', fontWeight: 'bold' })
  expect(timeline.style.border).toMatch(/^2px solid /)
})

test('exported images carry the theme background so text stays readable', async ({ page }) => {
  for (const [scheme, background] of [
    ['dark', 'rgb(31, 32, 39)'],
    ['light', 'rgb(253, 250, 245)'],
  ] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await openApp(page)
    await addChildToRoot(page, `Readable ${scheme}`)
    await page.getByRole('button', { name: 'Export' }).click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: 'SVG image' }).click()
    const svg = await readFile(await (await downloadPromise).path(), 'utf8')
    // The image must paint the theme background itself; viewers show a
    // transparent SVG on their own (usually white) background.
    const escaped = background.replace(/[()]/g, '\\$&')
    expect(svg, scheme).toMatch(new RegExp(`background-color:\\s?${escaped}`))
  }
})

test('transparent export uses the light version of a dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await openApp(page)
  await addChildToRoot(page, 'On white paper')
  const canvasBackground = () =>
    page.locator('.map-container').evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(await canvasBackground()).toBe('rgb(31, 32, 39)')

  await page.getByRole('button', { name: 'Export' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: /SVG, transparent/ }).click()
  const svg = await readFile(await (await downloadPromise).path(), 'utf8')

  expect(svg).toContain('On white paper')
  expect(svg).not.toMatch(/background-color:\s?rgb\(31, 32, 39\)/)
  // Light "wen2tu" colors: ink center topic and dark subtopic text.
  expect(svg).toMatch(/background-color:\s?rgb\(44, 45, 53\)/)
  // The editor goes back to the dark scheme, and nothing counts as an edit.
  await expect.poll(canvasBackground).toBe('rgb(31, 32, 39)')
  await expect(page.getByTestId('save-status')).toHaveText(/Draft/)
})

test('a first visit opens the Chinese welcome map by default', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page.locator('me-root me-tpc')).toHaveText('欢迎来到文兔兔')
  await expect(page.getByRole('button', { name: /^欢迎使用文兔兔/ })).toBeVisible()

  const topic = (text: string) => page.locator('me-tpc').filter({ hasText: new RegExp(`^${text}$`) })
  const rootBox = (await page.locator('me-root me-tpc').boundingBox())!
  for (const [text, side] of [
    ['文兔兔', 'left'],
    ['一键生成', 'left'],
    ['快捷键', 'left'],
    ['文件与保存', 'right'],
    ['下一步', 'right'],
    ['开源项目', 'right'],
  ] as const) {
    const box = (await topic(text).boundingBox())!
    expect(box.x < rootBox.x ? 'left' : 'right', text).toBe(side)
  }
  await expect(page.locator('me-tpc .icons')).toHaveCount(0)
  const github = page.locator('me-tpc', { hasText: 'GitHub' }).locator('a.hyper-link')
  await expect(github).toHaveAttribute('href', 'https://github.com/Liya66/wen2tu')

  // It is only created once; later visits reopen the last map.
  await page.waitForTimeout(600)
  await page.reload()
  await expect(page.getByRole('button', { name: /^欢迎使用文兔兔/ })).toHaveCount(1)

  // Untouched, it follows the interface language.
  await page.getByRole('combobox', { name: '语言' }).selectOption('en')
  await expect(page.locator('me-root me-tpc')).toHaveText('Welcome to wen2tu')
  await expect(page.getByRole('button', { name: /^Welcome to wen2tu/ })).toHaveCount(1)

  // Settings → Welcome map opens a fresh copy.
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('menuitem', { name: 'Welcome map' }).click()
  await expect(page.getByRole('button', { name: /^Welcome to wen2tu/ })).toHaveCount(2)
})

test('dragging a topic onto another moves its whole branch', async ({ page }) => {
  await openApp(page)
  await addChildToRoot(page, 'Branch A')
  await page.keyboard.press('Tab')
  await page.keyboard.insertText('A1')
  await page.keyboard.press('Enter')
  await addChildToRoot(page, 'Branch B')

  const source = page.locator('me-tpc').filter({ hasText: /^Branch A$/ })
  const target = page.locator('me-tpc').filter({ hasText: /^Branch B$/ })
  // One-sided layout keeps both branches in the middle of the screen (dragging
  // near the edge scrolls the canvas instead).
  await page.getByRole('button', { name: 'Style' }).click()
  const panel = page.getByRole('complementary', { name: 'Style' })
  await panel.getByRole('tab', { name: 'Map' }).click()
  await panel.getByRole('radio', { name: 'Right' }).click()
  await panel.getByRole('button', { name: 'Close style panel' }).click()

  // Closing the panel widens the canvas and re-centers the map; measure once it settles.
  const settled = async (locator: typeof source) => {
    let previous = JSON.stringify(await locator.boundingBox())
    for (;;) {
      await page.waitForTimeout(150)
      const current = JSON.stringify(await locator.boundingBox())
      if (current === previous) return JSON.parse(current) as { x: number; y: number; width: number; height: number }
      previous = current
    }
  }

  // Press on the unselected topic and drag it, as a user would.
  const from = await settled(source)
  const to = await settled(target)
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 })
  await page.mouse.up()

  // Branch A, with its child A1, is now inside Branch B.
  const branchB = page.locator('me-wrapper').filter({ has: target }).first()
  await expect(branchB.locator('me-tpc').filter({ hasText: /^Branch A$/ })).toBeVisible()
  await expect(branchB.locator('me-tpc').filter({ hasText: /^A1$/ })).toBeVisible()
  await expect(page.getByTestId('save-status')).toHaveText(/Draft/)
})

test('map shape is saved, and color rows stay on one line', async ({ page }) => {
  await useFakeFileSystem(page)
  await openApp(page)
  await addChildToRoot(page, 'Shaped')
  await page.getByRole('button', { name: 'Style' }).click()
  const panel = page.getByRole('complementary', { name: 'Style' })
  await panel.getByRole('tab', { name: 'Map' }).click()
  await panel.getByRole('radio', { name: 'Square' }).click()
  await expect(page.locator('me-root me-tpc')).toHaveCSS('border-radius', '0px')

  for (const row of await panel.locator('.color-row').all()) {
    const tops = await row.locator('.swatch').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top))
    expect(new Set(tops.map(Math.round)).size).toBe(1)
  }

  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByTestId('save-status')).toHaveText(/^Saved to/)
  const saved = JSON.parse(await page.evaluate(() => Object.values(window.__fs.files)[0]))
  expect(saved.map.shape).toBe('square')
  expect(saved.map.theme).toBeUndefined()
})

/** Dispatches a paste event carrying `text`, as the browser does for Ctrl/⌘+V. */
async function pasteText(page: import('@playwright/test').Page, text: string) {
  await page.evaluate((value) => {
    const data = new DataTransfer()
    data.setData('text/plain', value)
    const target = document.activeElement ?? document.body
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, text)
}

test.describe('pasting outlines', () => {
  test('onto a selected topic, an outline becomes its subtopics (one undo step)', async ({ page }) => {
    await openApp(page)
    await addChildToRoot(page, 'Target')
    await page.locator('me-tpc').filter({ hasText: /^Target$/ }).click()
    await pasteText(page, '```markdown\n- 前端\n  - React\n  - Vite\n- 后端\n  - Node\n```')

    const target = page.locator('me-wrapper').filter({ has: page.locator('me-tpc').filter({ hasText: /^Target$/ }) }).first()
    for (const text of ['前端', 'React', 'Vite', '后端', 'Node']) {
      await expect(target.locator('me-tpc').filter({ hasText: new RegExp(`^${text}$`) })).toBeVisible()
    }
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.locator('me-tpc').filter({ hasText: /^React$/ })).toHaveCount(0)
    await expect(page.locator('me-tpc').filter({ hasText: /^Target$/ })).toBeVisible()
  })

  test('with nothing selected, an outline becomes a new map', async ({ page }) => {
    await openApp(page)
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    await pasteText(page, '# 学习计划\n## 数学\n- 线性代数\n## 英语')
    await expect(page.locator('me-root me-tpc')).toHaveText('学习计划')
    await expect(page.getByRole('button', { name: /^学习计划/ })).toBeVisible()
    await expect(page.locator('me-tpc').filter({ hasText: /^线性代数$/ })).toBeVisible()
  })

  test('copied-topic data from the clipboard is sanitized', async ({ page }) => {
    let dialogOpened = false
    page.on('dialog', async (dialog) => {
      dialogOpened = true
      await dialog.dismiss()
    })
    await openApp(page)
    await page.locator('me-root me-tpc').click()
    await pasteText(
      page,
      JSON.stringify({
        magic: 'MIND-ELIXIR-WAIT-COPY',
        data: [{ id: 'x', topic: 'Pasted', dangerouslySetInnerHTML: '<img src=x onerror="alert(1)">' }],
      }),
    )
    await expect(page.locator('me-tpc').filter({ hasText: /^Pasted$/ })).toBeVisible()
    await expect(page.locator('me-tpc img')).toHaveCount(0)
    expect(dialogOpened).toBe(false)
  })

  test('the paste dialog creates a map and copies the AI prompt', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openApp(page)
    await page.getByRole('navigation').getByRole('button', { name: 'New', exact: true }).click()
    await page.getByRole('menuitem', { name: 'From pasted text…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create a map from text' })
    await dialog.getByRole('button', { name: 'Copy AI prompt' }).click()
    await expect(dialog.getByRole('button', { name: /Copied/ })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('level-1 heading')

    await expect(dialog.getByRole('button', { name: 'Create map' })).toBeDisabled()
    await dialog.getByRole('textbox').fill('Trip\n\tPacking\n\t\tPassport\n\tBudget')
    await dialog.getByRole('button', { name: 'Create map' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.locator('me-root me-tpc')).toHaveText('Trip')
    await expect(page.locator('me-tpc').filter({ hasText: /^Passport$/ })).toBeVisible()
  })
})

test.describe('Paste outline from the topic menu', () => {
  const openTopicMenu = async (page: import('@playwright/test').Page, topic: string) => {
    await page.locator('me-tpc').filter({ hasText: new RegExp(`^${topic}$`) }).click({ button: 'right' })
    const item = page.locator('#wen2tu-paste-outline')
    await expect(item).toBeVisible()
    return item
  }

  test('reads the clipboard and adds the outline under the topic', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openApp(page)
    await addChildToRoot(page, 'Target')
    await page.evaluate(() => navigator.clipboard.writeText('- Alpha\n  - Alpha 1\n- Beta'))

    const item = await openTopicMenu(page, 'Target')
    await expect(item).toContainText('Paste outline')
    await item.click()

    const target = page.locator('me-wrapper').filter({ has: page.locator('me-tpc').filter({ hasText: /^Target$/ }) }).first()
    for (const text of ['Alpha', 'Alpha 1', 'Beta']) {
      await expect(target.locator('me-tpc').filter({ hasText: new RegExp(`^${text}$`) })).toBeVisible()
    }
    await expect(page.locator('.context-menu')).toBeHidden()
  })

  test('falls back to the paste box when the clipboard cannot be read', async ({ page }) => {
    await openApp(page)
    await page.evaluate(() => {
      Object.defineProperty(navigator.clipboard, 'readText', {
        value: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
      })
    })
    await addChildToRoot(page, 'Target')
    await (await openTopicMenu(page, 'Target')).click()

    const dialog = page.getByRole('dialog', { name: 'Paste an outline under the selected topic' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('textbox').fill('Gamma\n\tGamma 1')
    await dialog.getByRole('button', { name: 'Add as subtopics' }).click()
    await expect(dialog).toBeHidden()
    const target = page.locator('me-wrapper').filter({ has: page.locator('me-tpc').filter({ hasText: /^Target$/ }) }).first()
    await expect(target.locator('me-tpc').filter({ hasText: /^Gamma 1$/ })).toBeVisible()
    // Still the same map, not a new one.
    await expect(page.locator('me-root me-tpc')).toHaveText('Central topic')
  })

  test('the menu item follows the interface language', async ({ page }) => {
    await openApp(page)
    await page.getByRole('combobox', { name: 'Language' }).selectOption('zh-CN')
    await expect(page.locator('#wen2tu-paste-outline span').first()).toHaveText('粘贴大纲')
  })
})

test('HTML export opens on its own, works offline, and imports back', async ({ page, context }) => {
  await openApp(page)
  await addChildToRoot(page, 'Branch')
  await page.keyboard.press('Tab')
  await page.keyboard.insertText('Leaf 叶子')
  await page.keyboard.press('Enter')

  await page.getByRole('button', { name: 'Export' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: /HTML \(interactive\)/ }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('Untitled map.html')
  const htmlPath = await download.path()
  const html = await readFile(htmlPath, 'utf8')

  // Open the exported file in a fresh page, with the network blocked.
  const viewer = await context.newPage()
  const requests: string[] = []
  await viewer.route('**/*', (route) => {
    requests.push(route.request().url())
    return route.abort()
  })
  const errors = trackConsoleErrors(viewer)
  await viewer.setContent(html)
  await expect(viewer.locator('me-root me-tpc')).toHaveText('Central topic')
  await expect(viewer.locator('me-tpc').filter({ hasText: /^Leaf 叶子$/ })).toBeVisible()
  expect(requests).toEqual([])
  expect(errors).toEqual([])

  // Read-only, but branches fold and unfold.
  await viewer.locator('me-tpc').filter({ hasText: /^Branch$/ }).dblclick()
  await expect(viewer.locator('#input-box')).toHaveCount(0)
  await viewer.locator('me-epd').first().click()
  await expect(viewer.locator('me-tpc').filter({ hasText: /^Leaf 叶子$/ })).toHaveCount(0)
  await viewer.locator('me-epd').first().click()
  await expect(viewer.locator('me-tpc').filter({ hasText: /^Leaf 叶子$/ })).toBeVisible()
  await viewer.close()

  // Import it back as an editable map.
  await useFallbackFileApi(page)
  await page.reload()
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await (await chooserPromise).setFiles({ name: 'shared.html', mimeType: 'text/html', buffer: Buffer.from(html) })
  await expect(page.getByRole('button', { name: /^shared/ })).toBeVisible()
  await expect(page.locator('me-tpc').filter({ hasText: /^Leaf 叶子$/ })).toBeVisible()
})

test.describe('extra topic shapes', () => {
  test('More… shapes are applied, drawn, saved and undoable', async ({ page }) => {
    await useFakeFileSystem(page)
    await openApp(page)
    await addChildToRoot(page, 'Decide')
    const topic = page.locator('me-tpc').filter({ hasText: /^Decide$/ })
    await topic.click()
    await page.getByRole('button', { name: 'Style' }).click()
    const panel = page.getByRole('complementary', { name: 'Style' })
    await panel.getByRole('radio', { name: 'More…' }).click()
    const grid = panel.getByRole('radiogroup', { name: 'More shapes' })
    await expect(grid.getByRole('radio')).toHaveCount(13)

    await grid.getByRole('radio', { name: 'Diamond' }).click()
    await expect(topic).toHaveAttribute('data-shape', 'diamond')
    await expect(topic.locator('svg.wen2tu-shape path')).toHaveAttribute('d', /^M /)
    await expect(grid.getByRole('radio', { name: 'Diamond' })).toHaveAttribute('aria-checked', 'true')

    // Switching to a CSS shape removes the SVG outline.
    await grid.getByRole('radio', { name: 'Ellipse' }).click()
    await expect(topic).toHaveAttribute('data-shape', 'ellipse')
    await expect(topic.locator('svg.wen2tu-shape')).toHaveCount(0)

    await page.keyboard.press('ControlOrMeta+s')
    await expect(page.getByTestId('save-status')).toHaveText(/^Saved to/)
    const saved = JSON.parse(await page.evaluate(() => Object.values(window.__fs.files)[0]))
    expect(saved.map.nodeData.children[0].shape).toBe('ellipse')

    // A corner style replaces the extra shape; undo brings it back.
    await panel.getByRole('radio', { name: 'Rounded' }).click()
    await expect(topic).not.toHaveAttribute('data-shape', /.+/)
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.locator('me-tpc').filter({ hasText: /^Decide$/ })).toHaveAttribute('data-shape', 'ellipse')
  })

  test('shapes come along in exported SVG', async ({ page }) => {
    await openApp(page)
    await addChildToRoot(page, 'Cloudy')
    await page.locator('me-tpc').filter({ hasText: /^Cloudy$/ }).click()
    await page.getByRole('button', { name: 'Style' }).click()
    const panel = page.getByRole('complementary', { name: 'Style' })
    await panel.getByRole('radio', { name: 'More…' }).click()
    await panel.getByRole('radio', { name: 'Cloud' }).click()
    await page.getByRole('button', { name: 'Export' }).click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: 'SVG image' }).click()
    const svg = await readFile(await (await downloadPromise).path(), 'utf8')
    expect(svg).toContain('wen2tu-shape')
    expect(svg).toContain('Cloudy')
  })
})

test.describe('templates', () => {
  test('pour your own outline into a template', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openApp(page)
    await page.getByRole('navigation').getByRole('button', { name: 'New', exact: true }).click()
    await page.getByRole('menuitem', { name: 'From template…' }).click()
    await page.getByTestId('template-trip').click()
    const dialog = page.getByRole('dialog', { name: 'Trip plan' })
    await expect(dialog.getByRole('list', { name: 'Shapes in this template' })).toContainText('Ticket')

    await dialog.getByRole('button', { name: 'Copy AI prompt' }).click()
    const prompt = await page.evaluate(() => navigator.clipboard.readText())
    expect(prompt).toContain('# Tokyo in 5 days')
    expect(prompt).toContain('My content:')

    await expect(dialog.getByRole('button', { name: 'Create with this template' })).toBeDisabled()
    await dialog.getByRole('textbox').fill('```markdown\n# Paris weekend\n## Day 1\n- Louvre\n## Packing\n- Umbrella\n```')
    await dialog.getByRole('button', { name: 'Create with this template' }).click()
    await expect(dialog).toBeHidden()

    await expect(page.locator('me-root me-tpc')).toHaveText('Paris weekend')
    await expect(page.locator('me-root me-tpc')).toHaveAttribute('data-shape', 'ticket')
    await expect(page.locator('me-tpc').filter({ hasText: /^Day 1$/ })).toHaveAttribute('data-shape', 'flag')
    await expect(page.locator('me-tpc').filter({ hasText: /^Louvre$/ })).toHaveAttribute('data-shape', 'tag')
    await expect(page.getByRole('button', { name: /^Paris weekend/ })).toBeVisible()
  })

  test('copy the current map as Markdown', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openApp(page)
    await addChildToRoot(page, 'Point A')
    await page.getByRole('button', { name: 'Export' }).click()
    await page.getByRole('menuitem', { name: 'Copy as Markdown' }).click()
    await expect(page.getByTestId('notice-copied-markdown')).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('# Central topic\n\n- Point A\n')
  })
})

test('selecting several topics: Ctrl/⌘-click and box selection, also with a map shape', async ({ page }) => {
  await openApp(page)
  for (const name of ['Alpha', 'Beta', 'Gamma']) await addChildToRoot(page, name)
  const topic = (name: string) => page.locator('me-tpc').filter({ hasText: new RegExp(`^${name}$`) })
  const selected = () => page.locator('me-tpc.selected').allInnerTexts()

  const boxSelect = async () => {
    await page.locator('.map-container').click({ position: { x: 30, y: 400 } })
    const boxes = await Promise.all(['Alpha', 'Beta', 'Gamma'].map((n) => topic(n).boundingBox()))
    const x1 = Math.min(...boxes.map((b) => b!.x)) - 15
    const y1 = Math.min(...boxes.map((b) => b!.y)) - 15
    await page.mouse.move(x1, y1)
    await page.mouse.down()
    await page.mouse.move(
      Math.max(...boxes.map((b) => b!.x + b!.width)) + 15,
      Math.max(...boxes.map((b) => b!.y + b!.height)) + 15,
      { steps: 15 },
    )
    await page.mouse.up()
  }

  for (const shaped of [false, true]) {
    if (shaped) {
      await page.getByRole('button', { name: 'Style' }).click()
      const panel = page.getByRole('complementary', { name: 'Style' })
      await panel.getByRole('tab', { name: 'Map' }).click()
      await panel.getByRole('radio', { name: 'Square' }).click()
      await panel.getByRole('button', { name: 'Close style panel' }).click()
    }
    await topic('Alpha').click()
    await topic('Beta').click({ modifiers: ['ControlOrMeta'] })
    expect((await selected()).sort(), `ctrl-click, shaped=${shaped}`).toEqual(['Alpha', 'Beta'])

    await boxSelect()
    expect(await selected(), `box, shaped=${shaped}`).toEqual(expect.arrayContaining(['Alpha', 'Beta', 'Gamma']))
  }
})
