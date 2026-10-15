export const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)

/** Label for the primary modifier key: ⌘ on Apple devices, Ctrl elsewhere. */
export const MOD = isMac ? '⌘' : 'Ctrl'

export function shortcut(...keys: string[]): string {
  return [MOD, ...keys].join(isMac ? '' : '+')
}
