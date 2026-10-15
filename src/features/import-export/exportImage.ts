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
  const capture = await snapdom(target, {
    backgroundColor,
    // Higher resolution for raster output so text stays crisp when zoomed.
    scale: format === 'png' ? 2 : 1,
    embedFonts: true,
  })
  return capture.toBlob({ format })
}
