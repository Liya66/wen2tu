const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Escapes text so it can be assigned to innerHTML as plain text. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch])
}

const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/** Returns the URL if it uses a safe link protocol, otherwise undefined. */
export function safeLinkUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  try {
    const url = new URL(trimmed)
    return LINK_PROTOCOLS.has(url.protocol) ? trimmed : undefined
  } catch {
    return undefined
  }
}

/** Images may only come from https or be embedded as raster data URLs. */
export function safeImageUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(trimmed)) return trimmed
  try {
    return new URL(trimmed).protocol === 'https:' ? trimmed : undefined
  } catch {
    return undefined
  }
}

/** CSS values must not be able to load resources or break out of the declaration. */
export function safeCssValue(value: string): string | undefined {
  if (value.length > 200) return undefined
  if (/url\s*\(|expression\s*\(|@import|[;{}<>\\]/i.test(value)) return undefined
  return value
}
