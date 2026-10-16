import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'

export const LANGUAGES = ['en', 'zh-CN'] as const
export type Language = (typeof LANGUAGES)[number]

/** Each language has its own address: / is Chinese, /en/ is English. */
const PATHS: Record<Language, string> = { 'zh-CN': '/', en: '/en/' }

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
    history.replaceState(history.state, '', PATHS[language] + location.search + location.hash)
  }
  return i18n.changeLanguage(language)
}

function syncDocumentLanguage(language: string) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = language
  document.title = language === 'zh-CN' ? '文兔兔 · 思维导图' : 'wen2tu · mind maps'
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
