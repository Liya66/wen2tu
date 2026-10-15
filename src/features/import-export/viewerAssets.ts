import type { ViewerAssets } from './htmlExport'

/**
 * Loads the prebuilt viewer (see vite.viewer.config.ts) as text. Imported on
 * demand, so the viewer stays out of the app's own bundle until someone
 * exports an HTML file.
 */
export async function loadViewerAssets(): Promise<ViewerAssets> {
  const [script, css] = await Promise.all([
    import('../../../generated/viewer/viewer.js?raw'),
    import('../../../generated/viewer/viewer.css?raw'),
  ])
  return { script: script.default, css: css.default }
}
