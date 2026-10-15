/**
 * Fallback for browsers without the File System Access API (Firefox, Safari):
 * files are read through an <input type="file"> and written as downloads.
 * A download never overwrites the original file.
 */

import type { PickedFile } from './fileSystemAdapter'

/** Opens a file input. Resolves to null if the user cancels. */
export function pickFileWithInput(accept: string[]): Promise<PickedFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept.join(',')
    input.style.display = 'none'
    document.body.appendChild(input)

    const cleanup = () => input.remove()
    input.addEventListener(
      'change',
      async () => {
        const file = input.files?.[0]
        cleanup()
        if (!file) return resolve(null)
        try {
          resolve({ name: file.name, text: await file.text(), lastModified: file.lastModified })
        } catch (error) {
          reject(error)
        }
      },
      { once: true },
    )
    input.addEventListener(
      'cancel',
      () => {
        cleanup()
        resolve(null)
      },
      { once: true },
    )
    input.click()
  })
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Give the browser time to start the download before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function downloadText(text: string, fileName: string, type: string): void {
  downloadBlob(new Blob([text], { type: `${type};charset=utf-8` }), fileName)
}
