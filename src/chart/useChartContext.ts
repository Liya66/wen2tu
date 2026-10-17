import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ChartLabels } from '../features/chart/buildOption'
import type { ChartLanguage } from '../features/chart/format'
import { DARK, LIGHT, type ChartColors } from '../features/chart/theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function useDarkMode(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia(DARK_QUERY).matches)
  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY)
    const onChange = () => setDark(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return dark
}

/** What every chart on the page shares: language, light or dark colours, and translated labels. */
export function useChartContext(): { lang: ChartLanguage; colors: ChartColors; labels: ChartLabels } {
  const { t, i18n } = useTranslation()
  const dark = useDarkMode()
  const lang: ChartLanguage = i18n.resolvedLanguage === 'en' ? 'en' : 'zh-CN'
  const labels = useMemo<ChartLabels>(
    () => ({ other: t('chart.other'), value: t('chart.value'), period: t('chart.period'), points: t('chart.points') }),
    [t],
  )
  return { lang, colors: dark ? DARK : LIGHT, labels }
}
