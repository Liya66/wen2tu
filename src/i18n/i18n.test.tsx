import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import i18n, { detectLanguage } from './index'
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
  it('prefers the saved choice, then the browser, then English', () => {
    expect(detectLanguage('en', ['zh-CN'])).toBe('en')
    expect(detectLanguage(null, ['zh-TW', 'en'])).toBe('zh-CN')
    expect(detectLanguage(null, ['fr-FR', 'en-GB'])).toBe('en')
    expect(detectLanguage(null, ['fr-FR'])).toBe('en')
    expect(detectLanguage(null, [])).toBe('en')
  })
})

describe('LanguageSwitcher', () => {
  it('switches the interface language and remembers it', async () => {
    await act(() => i18n.changeLanguage('en'))
    render(<LanguageSwitcher />)
    const select = screen.getByRole('combobox', { name: 'Language' })
    await userEvent.selectOptions(select, 'zh-CN')
    expect(i18n.language).toBe('zh-CN')
    expect(localStorage.getItem('wen2tu.language')).toBe('zh-CN')
    expect(document.documentElement.lang).toBe('zh-CN')
    expect(screen.getByRole('combobox', { name: '语言' })).toHaveValue('zh-CN')
  })
})
