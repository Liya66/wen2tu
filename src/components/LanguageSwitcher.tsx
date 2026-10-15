import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LANGUAGES, setLanguage, type Language } from '../i18n'

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const current = (LANGUAGES as readonly string[]).includes(i18n.resolvedLanguage ?? '')
    ? (i18n.resolvedLanguage as Language)
    : 'en'

  return (
    <label className="language-switcher" title={t('language.label')}>
      <Languages size={16} aria-hidden="true" />
      <span className="visually-hidden">{t('language.label')}</span>
      <select value={current} onChange={(event) => void setLanguage(event.target.value as Language)}>
        {LANGUAGES.map((lang) => (
          // Each language is named in itself so it can be found in either UI.
          <option key={lang} value={lang} lang={lang}>
            {t(`language.${lang}`)}
          </option>
        ))}
      </select>
    </label>
  )
}
