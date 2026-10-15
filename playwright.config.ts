import { defineConfig, devices } from '@playwright/test'

const CI = Boolean(process.env.CI)
// A dedicated port, always rebuilt, so a stale `npm run preview` is never tested by mistake.
const PORT = 4183

/**
 * End-to-end tests run against the production build served by `vite preview`,
 * which applies the same security headers as Cloudflare Pages (public/_headers).
 * Locally they use the installed Google Chrome; CI uses Playwright's Chromium.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: CI ? undefined : 'chrome' },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
