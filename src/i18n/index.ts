import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'

export const LANGUAGES = ['en', 'zh-CN'] as const
export type Language = (typeof LANGUAGES)[number]

const STORAGE_KEY = 'wen2tu.language'

function readStoredLanguage(): Language | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return LANGUAGES.includes(value as Language) ? (value as Language) : null
  } catch {
    return null
  }
}

/** Saved preference first, then the browser's languages, then English. */
export function detectLanguage(
  stored: Language | null = readStoredLanguage(),
  browserLanguages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages,
): Language {
  if (stored) return stored
  for (const lang of browserLanguages) {
    const lower = lang.toLowerCase()
    if (lower.startsWith('zh')) return 'zh-CN'
    if (lower.startsWith('en')) return 'en'
  }
  return 'en'
}

export function setLanguage(language: Language): Promise<unknown> {
  try {
    localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // Preference just won't persist.
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
  fallbackLng: 'en',
  supportedLngs: [...LANGUAGES],
  interpolation: {
    // React already escapes rendered strings.
    escapeValue: false,
  },
})

syncDocumentLanguage(i18n.language)
i18n.on('languageChanged', syncDocumentLanguage)

export default i18n
