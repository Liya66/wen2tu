import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'

export const LANGUAGES = ['en', 'zh-CN'] as const
export type Language = (typeof LANGUAGES)[number]

/**
 * Each language has its own address: / is Chinese, /en/ is English, and the
 * same holds below them (/chart/ and /en/chart/).
 */
export function languagePath(pathname: string, language: Language): string {
  const rest = pathname.replace(/^\/en(?=\/|$)/, '') || '/'
  return language === 'en' ? `/en${rest}` : rest
}

/** The language of a page address (Chinese unless it is under /en/). */
export function detectLanguage(pathname: string = currentPath()): Language {
  return /^\/en(\/|$)/.test(pathname) ? 'en' : 'zh-CN'
}

function currentPath(): string {
  return typeof location === 'undefined' ? '/' : location.pathname
}

/**
 * Switches the interface language and moves to that language's address
 * without reloading, so a reload or a shared link keeps the language.
 */
export function setLanguage(language: Language): Promise<unknown> {
  if (typeof location !== 'undefined' && detectLanguage() !== language) {
    history.replaceState(history.state, '', languagePath(location.pathname, language) + location.search + location.hash)
  }
  return i18n.changeLanguage(language)
}

/** Page titles per app; a page names its app with <html data-app="…">. */
const TITLES: Record<string, Record<Language, string>> = {
  mindmap: { 'zh-CN': '文兔兔 · 思维导图', en: 'wen2tu · mind maps' },
  chart: { 'zh-CN': '统计兔 · 粘贴表格自动出图', en: 'data2tu · paste a table, get the chart' },
}

function syncDocumentLanguage(language: string) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = language
  const titles = TITLES[document.documentElement.dataset.app ?? ''] ?? TITLES.mindmap
  document.title = titles[language === 'en' ? 'en' : 'zh-CN']
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-CN': { translation: zhCN },
  },
  lng: detectLanguage(),
  fallbackLng: 'zh-CN',
  supportedLngs: [...LANGUAGES],
  interpolation: {
    // React already escapes rendered strings.
    escapeValue: false,
  },
})

syncDocumentLanguage(i18n.language)
i18n.on('languageChanged', syncDocumentLanguage)

export default i18n
