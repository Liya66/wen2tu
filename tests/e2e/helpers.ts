import { expect, type Page } from '@playwright/test'

/** Fails the test on any console error, including Content-Security-Policy violations. */
export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

export async function openApp(page: Page, language: 'en' | 'zh-CN' = 'en') {
  await page.addInitScript((lang) => {
    if (!localStorage.getItem('wen2tu.language')) localStorage.setItem('wen2tu.language', lang)
  }, language)
  await page.goto('/')
  await expect(page.locator('me-root me-tpc')).toBeVisible()
  await expect(page.getByTestId('save-status')).not.toBeEmpty()
}

/** Adds a child under the root node and types its text. */
export async function addChildToRoot(page: Page, text: string) {
  await page.locator('me-root me-tpc').click()
  await page.keyboard.press('Tab')
  await page.locator('#input-box').waitFor()
  await page.keyboard.insertText(text)
  await page.keyboard.press('Enter')
  await expect(page.locator('me-tpc', { hasText: text })).toBeVisible()
}

export async function rootTopic(page: Page) {
  return page.locator('me-root me-tpc').innerText()
}

/** Removes the File System Access API so the app uses its download fallback (like Firefox/Safari). */
export async function useFallbackFileApi(page: Page) {
  await page.addInitScript(() => {
    delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })
}

/**
 * Replaces the native file pickers with an in-memory file system, so saving
 * and reopening real file handles can be tested without OS dialogs.
 * `window.__fs.files` maps file names to their contents; set
 * `window.__fs.nextOpen` to choose which file the open picker returns.
 */
export async function useFakeFileSystem(page: Page) {
  await page.addInitScript(() => {
    class FakeHandle {
      kind = 'file'
      name: string
      content: string
      lastModified = Date.now()
      constructor(name: string, content: string) {
        this.name = name
        this.content = content
      }
      async getFile() {
        return new File([this.content], this.name, { lastModified: this.lastModified })
      }
      async createWritable() {
        let buffer = ''
        return {
          write: async (data: string) => {
            buffer += data
          },
          close: async () => {
            this.content = buffer
            this.lastModified += 1
          },
          abort: async () => {},
        }
      }
      async isSameEntry(other: unknown) {
        return other === this
      }
      async queryPermission() {
        return 'granted'
      }
      async requestPermission() {
        return 'granted'
      }
    }
    const fs = { handles: new Map<string, FakeHandle>(), nextOpen: '', lastOpenOptions: null as unknown }
    Object.assign(window, {
      __fs: {
        get files() {
          return Object.fromEntries([...fs.handles].map(([name, handle]) => [name, handle.content]))
        },
        set nextOpen(name: string) {
          fs.nextOpen = name
        },
        get lastOpenOptions() {
          return fs.lastOpenOptions
        },
        put(name: string, content: string) {
          fs.handles.set(name, new FakeHandle(name, content))
        },
        externalWrite(name: string, content: string) {
          const handle = fs.handles.get(name)!
          handle.content = content
          handle.lastModified += 10_000
        },
      },
      showSaveFilePicker: async (options: { suggestedName: string }) => {
        const handle = new FakeHandle(options.suggestedName, '')
        fs.handles.set(handle.name, handle)
        return handle
      },
      showOpenFilePicker: async (options: unknown) => {
        fs.lastOpenOptions = options
        const handle = fs.handles.get(fs.nextOpen)
        if (!handle) throw new DOMException('cancelled', 'AbortError')
        return [handle]
      },
    })
  })
}
