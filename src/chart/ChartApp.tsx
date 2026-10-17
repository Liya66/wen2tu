import { useDeferredValue, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { Logo } from '../components/Logo'
import { columnLabel } from '../features/chart/buildOption'
import { FIXTURES } from '../features/chart/fixtures'
import { formatDate, formatValue, type ChartLanguage } from '../features/chart/format'
import { recommend } from '../features/chart/recommend'
import { analyzeText, chartColumns, type Column, type Note, type Table } from '../features/chart/table'
import { languagePath } from '../i18n'
import { ChartCard } from './ChartCard'

const PREVIEW_ROWS = 50

export function ChartApp() {
  const { t, i18n } = useTranslation()
  const lang: ChartLanguage = i18n.resolvedLanguage === 'en' ? 'en' : 'zh-CN'
  const [text, setText] = useState('')
  const [sample, setSample] = useState('')
  const deferred = useDeferredValue(text)
  const table = useMemo(() => (deferred.trim() ? analyzeText(deferred) : null), [deferred])
  const recommendations = useMemo(() => (table ? recommend(table).slice(0, 3) : []), [table])

  const pickSample = (id: string) => {
    setSample(id)
    const fixture = FIXTURES.find((f) => f.id === id)
    if (fixture) setText(fixture.text)
  }

  return (
    <div className="chart-app">
      <header className="toolbar">
        <div className="brand">
          <Logo size={26} />
          <span>{t('chart.title')}</span>
          <span className="chart-badge">{t('chart.prototype')}</span>
        </div>
        <span className="chart-tagline">{t('chart.tagline')}</span>
        <div className="toolbar-end">
          <a className="tool-button chart-link" href={languagePath('/', lang)}>
            {t('chart.mindmap')}
          </a>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="chart-main">
        <section className="chart-input" aria-labelledby="paste-label">
          <div className="chart-input-head">
            <label id="paste-label" htmlFor="paste">
              {t('chart.pasteLabel')}
            </label>
            {text && (
              <button
                type="button"
                className="button"
                onClick={() => {
                  setText('')
                  setSample('')
                }}
              >
                {t('chart.clear')}
              </button>
            )}
          </div>
          <textarea
            id="paste"
            className="chart-paste"
            value={text}
            spellCheck={false}
            placeholder={t('chart.pastePlaceholder')}
            onChange={(event) => {
              setText(event.target.value)
              setSample('')
            }}
          />
          <label className="select-field chart-samples">
            <span>{t('chart.samples')}</span>
            <select value={sample} onChange={(event) => pickSample(event.target.value)}>
              <option value="">{t('chart.samplePick')}</option>
              {FIXTURES.map((fixture) => (
                <option key={fixture.id} value={fixture.id}>
                  {fixture.name[lang === 'en' ? 'en' : 'zh']}
                </option>
              ))}
            </select>
          </label>
          {table && <Detection table={table} />}
        </section>

        <section className="chart-results" aria-live="polite">
          {!deferred.trim() && <p className="chart-empty">{t('chart.empty')}</p>}
          {deferred.trim() && !table && <p className="chart-empty">{t('chart.noTable')}</p>}
          {table && !recommendations.length && <p className="chart-empty">{t('chart.noChart')}</p>}
          {table &&
            recommendations.map((rec, i) => (
              <ChartCard key={`${deferred.length}-${i}-${rec.type}`} rank={i + 1} rec={rec} table={table} />
            ))}
          {table && recommendations.length > 0 && <DataTable table={table} lang={lang} />}
        </section>
      </main>
    </div>
  )
}

function noteText(note: Note, t: (key: string, options?: Record<string, unknown>) => string): string {
  switch (note.code) {
    case 'ignored-lines':
      return t('chart.notes.ignored-lines', { count: note.count })
    case 'dropped-summary-rows':
      return t('chart.notes.dropped-summary-rows', { labels: note.labels.join('、') })
    case 'total-column':
      return t('chart.notes.total-column', { column: note.column })
    case 'sql-used':
      return t('chart.notes.sql-used')
  }
}

function unitText(col: Column): string {
  if (col.unit.percent) return '%'
  return col.unit.prefix + col.unit.suffix
}

function Detection({ table }: { table: Table }) {
  const { t } = useTranslation()
  return (
    <div className="chart-detect">
      <h2>{t('chart.detected')}</h2>
      <p className="chart-detect-meta">
        <span>{t(`chart.format.${table.format}`)}</span>
        <span>
          {t(`chart.shape.${table.shape}`)} · {t(`chart.shapeHint.${table.shape}`)}
        </span>
        <span>{t('chart.rows', { count: table.rowCount })}</span>
      </p>
      <ul className="chart-columns">
        {table.melted && (
          <li data-type="date">
            <b>
              {table.melted.from[0]} … {table.melted.from[table.melted.from.length - 1]}
            </b>
            <span>
              {t('chart.type.date')} · {t('chart.meltedColumns', { count: table.melted.from.length })}
            </span>
          </li>
        )}
        {table.columns
          .filter((col) => !table.melted?.from.includes(col.name))
          .map((col) => (
            <li key={col.name} data-type={col.type} data-role={col.role}>
              <b>{col.label || col.name}</b>
              <span>
                {t(`chart.type.${col.type}`)}
                {unitText(col) && ` · ${unitText(col)}`}
                {col.aggregate && ` · ${col.aggregate.toUpperCase()}`}
                {(col.role === 'total' || col.role === 'id') && ` · ${t(`chart.role.${col.role}`)}`}
              </span>
            </li>
          ))}
      </ul>
      {table.notes.length > 0 && (
        <ul className="chart-notes">
          {table.notes.map((note, i) => (
            <li key={i}>{noteText(note, t)}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function cellText(col: Column, row: number, lang: ChartLanguage): string {
  switch (col.type) {
    case 'number':
      return col.values[row] === null ? '–' : formatValue(col.values[row], col.unit, lang)
    case 'date':
      return col.values[row] === null ? '–' : formatDate(col.values[row]!, col.grain, lang, col.yearless)
    case 'range': {
      const range = col.ranges[row]
      return range ? `${formatDate(range[0], col.grain, lang)} – ${formatDate(range[1] - 864e5, col.grain, lang)}` : '–'
    }
    default:
      return col.text[row] || '–'
  }
}

/** The parsed values as a table: what the charts were drawn from, and a way to read them without colour. */
function DataTable({ table, lang }: { table: Table; lang: ChartLanguage }) {
  const { t } = useTranslation()
  const { columns, rowCount } = chartColumns(table)
  const labels = { other: t('chart.other'), value: t('chart.value'), period: t('chart.period') }
  const rows = Math.min(rowCount, PREVIEW_ROWS)
  return (
    <details className="chart-data">
      <summary>{t('chart.dataTable')}</summary>
      <div className="chart-data-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.name} data-numeric={col.type === 'number' || undefined}>
                  {columnLabel(col, labels)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, row) => (
              <tr key={row}>
                {columns.map((col) => (
                  <td key={col.name} data-numeric={col.type === 'number' || undefined}>
                    {cellText(col, row, lang)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
