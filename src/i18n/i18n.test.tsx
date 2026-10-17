import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import i18n, { detectLanguage, languagePath } from './index'
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key))
}

describe('translations', () => {
  it('has the same keys in every language', () => {
    expect(keys(zhCN).sort()).toEqual(keys(en).sort())
  })

  it('has no empty strings', () => {
    for (const locale of [en, zhCN]) {
      for (const key of keys(locale)) {
        const value = key.split('.').reduce<unknown>((obj, part) => (obj as Record<string, unknown>)[part], locale)
        expect(value, key).not.toBe('')
      }
    }
  })

  it('has a message for every document error code', () => {
    const codes = [
      'invalid-json',
      'not-a-mindmap',
      'unsupported-version',
      'invalid-structure',
      'too-large',
      'invalid-markdown',
      'invalid-opml',
      'unsupported-file',
    ]
    for (const code of codes) expect(en.errors).toHaveProperty(code)
  })
})

describe('detectLanguage', () => {
  it('reads the language from the address: /en/ is English, the rest Chinese', () => {
    expect(detectLanguage('/en/')).toBe('en')
    expect(detectLanguage('/en')).toBe('en')
    expect(detectLanguage('/en/index.html')).toBe('en')
    expect(detectLanguage('/')).toBe('zh-CN')
    expect(detectLanguage('/index.html')).toBe('zh-CN')
    expect(detectLanguage('/english')).toBe('zh-CN')
  })
})

describe('languagePath', () => {
  it('keeps the page and only swaps the /en prefix', () => {
    expect(languagePath('/', 'en')).toBe('/en/')
    expect(languagePath('/en/', 'zh-CN')).toBe('/')
    expect(languagePath('/en', 'zh-CN')).toBe('/')
    expect(languagePath('/chart/', 'en')).toBe('/en/chart/')
    expect(languagePath('/en/chart/', 'zh-CN')).toBe('/chart/')
    expect(languagePath('/en/chart/', 'en')).toBe('/en/chart/')
  })
})

describe('LanguageSwitcher', () => {
  it('switches the interface language and its address', async () => {
    history.replaceState(null, '', '/en/?x=1#top')
    await act(() => i18n.changeLanguage('en'))
    render(<LanguageSwitcher />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'zh-CN')
    expect(i18n.language).toBe('zh-CN')
    expect(location.pathname + location.search + location.hash).toBe('/?x=1#top')
    expect(document.documentElement.lang).toBe('zh-CN')

    await userEvent.selectOptions(screen.getByRole('combobox', { name: '语言' }), 'en')
    expect(location.pathname).toBe('/en/')
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue('en')
  })
})
