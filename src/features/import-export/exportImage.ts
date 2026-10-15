export type ImageFormat = 'png' | 'svg'

/**
 * Renders the map's node layer to an image. snapdom is loaded on demand so
 * it stays out of the initial bundle.
 */
export async function exportImage(
  target: HTMLElement,
  format: ImageFormat,
  backgroundColor: string,
): Promise<Blob> {
  const { snapdom } = await import('@zumer/snapdom')
  // snapdom's backgroundColor only applies to raster formats; an SVG would be
  // transparent and show light (dark-theme) text on a viewer's white page.
  // Painting the background on the captured element bakes it into every format.
  const previous = target.style.backgroundColor
  target.style.backgroundColor = backgroundColor
  try {
    const capture = await snapdom(target, {
      backgroundColor,
      // Higher resolution for raster output so text stays crisp when zoomed.
      scale: format === 'png' ? 2 : 1,
      embedFonts: true,
    })
    return await capture.toBlob({ format })
  } finally {
    target.style.backgroundColor = previous
  }
}
