import { expect, test, type Page } from '@playwright/test'
import { openApp } from './helpers'

// Switching the map shape changes topic sizes; branch lines must be drawn
// against the new sizes, exactly as they are after a reload.
const linePaths = (page: Page) =>
  page.evaluate(() => ({
    main: [...document.querySelectorAll('.map-container .lines path')].map((p) => p.getAttribute('d')),
    sub: [...document.querySelectorAll('.map-container .subLines path')].map((p) => p.getAttribute('d')),
  }))

for (const [from, to] of [
  ['Default', 'Square'],
  ['Square', 'Default'],
  ['Square', 'Pill'],
] as const) {
  test(`shape ${from} -> ${to} draws same lines as reload`, async ({ page }) => {
    await openApp(page, 'en', { welcome: true })
    await page.getByRole('button', { name: 'Style' }).click()
    const panel = page.getByRole('complementary', { name: 'Style' })
    await panel.getByRole('tab', { name: 'Map' }).click()
    await panel.getByRole('radio', { name: from }).click()
    await panel.getByRole('radio', { name: to }).click()
    await page.waitForTimeout(800)
    const live = await linePaths(page)
    await page.reload()
    await expect(page.locator('me-root me-tpc')).toBeVisible()
    await page.waitForTimeout(800)
    const reloaded = await linePaths(page)
    expect(live.main).toEqual(reloaded.main)
    expect(live.sub).toEqual(reloaded.sub)
  })
}
