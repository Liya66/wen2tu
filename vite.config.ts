/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * Reads the production security headers from public/_headers so that
 * `vite preview` (and the end-to-end tests that run against it) enforce the
 * same Content-Security-Policy as Cloudflare Pages.
 */
function productionHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  const text = readFileSync(new URL('./public/_headers', import.meta.url), 'utf8')
  const block = text.split(/^\/\*\s*$/m)[1]?.split(/^\/\S/m)[0] ?? ''
  for (const line of block.split('\n')) {
    const match = line.match(/^\s+([\w-]+):\s*(.+)$/)
    if (match) headers[match[1]] = match[2].trim()
  }
  return headers
}

export default defineConfig({
  plugins: [react()],
  build: {
    // The editor (React + Mind Elixir + schema validation) is ~160 kB gzipped;
    // importers and image export are split out and loaded on demand.
    chunkSizeWarningLimit: 600,
    // One page per interface language: / is Chinese, /en/ is English.
    // The chart mode (统计兔 data2tu) lives at /chart/ and /en/chart/.
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        en: fileURLToPath(new URL('./en/index.html', import.meta.url)),
        chart: fileURLToPath(new URL('./chart/index.html', import.meta.url)),
        enChart: fileURLToPath(new URL('./en/chart/index.html', import.meta.url)),
      },
    },
  },
  preview: {
    headers: productionHeaders(),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
