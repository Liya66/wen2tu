import { describe, expect, it } from 'vitest'
import { buildChart, type BuildContext } from './buildOption'
import { extractGrid } from './extract'
import { FIXTURES } from './fixtures'
import { recommend } from './recommend'
import { parseSqlHints } from './sqlHints'
import { analyzeText, readHeaderUnit } from './table'
import { LIGHT } from './theme'
import { formatValue } from './format'
import { parseCell, parseDate, parseNumber, parseRange } from './values'

describe('cell values', () => {
  it.each([
    ['1,234', 1234],
    ['12.5%', 0.125],
    ['¥3.2万', 32000],
    ['1.2亿', 120000000],
    ['$1.2M', 1200000],
    ['12.5K', 12500],
    ['(1,500)', -1500],
    ['-3.5', -3.5],
    ['8,760万', 87600000],
  ])('reads %s as %d', (text, value) => {
    expect(parseNumber(text)?.value).toBeCloseTo(value)
  })

  it('keeps the currency and unit', () => {
    expect(parseNumber('¥3.2万')).toMatchObject({ prefix: '¥', scaled: true })
    expect(parseNumber('120元')).toMatchObject({ value: 120, suffix: '元' })
  })

  it.each(['', '—', '-', 'N/A', 'null', '#N/A', '–'])('treats %j as missing', (text) => {
    expect(parseCell(text).kind).toBe('missing')
  })

  it.each([
    ['2024-03', 'month', Date.UTC(2024, 2, 1)],
    ['2024年3月', 'month', Date.UTC(2024, 2, 1)],
    ['2024-03-05', 'day', Date.UTC(2024, 2, 5)],
    ['Q1', 'quarter', Date.UTC(2000, 0, 1)],
    ['2024 Q3', 'quarter', Date.UTC(2024, 6, 1)],
    ['2024年第二季度', 'quarter', Date.UTC(2024, 3, 1)],
    ['Jan-24', 'month', Date.UTC(2024, 0, 1)],
    ['3月', 'month', Date.UTC(2000, 2, 1)],
  ] as const)('reads %s as a %s', (text, grain, t) => {
    expect(parseDate(text)).toMatchObject({ grain, t })
  })

  it('does not read words as months', () => {
    expect(parseDate('Marketing')).toBeNull()
    expect(parseDate('May')).not.toBeNull()
  })

  it('reads ranges, with the end covering its whole period', () => {
    expect(parseRange('Jan 2024 – Mar 2024')).toMatchObject({ start: Date.UTC(2024, 0, 1), end: Date.UTC(2024, 3, 1) })
    expect(parseRange('2024-03-01 ~ 2024-03-15')).toMatchObject({ end: Date.UTC(2024, 2, 16) })
    expect(parseRange('18-24')).toBeNull()
  })

  it('reads units from headers', () => {
    expect(readHeaderUnit('GDP（亿元）')).toMatchObject({ label: 'GDP', scale: 1e8, unit: { suffix: '元' } })
    expect(readHeaderUnit('Revenue ($M)')).toMatchObject({ label: 'Revenue', scale: 1e6, unit: { prefix: '$' } })
    expect(readHeaderUnit('转化率(%)')).toMatchObject({ unit: { percent: true } })
    expect(readHeaderUnit('销售额（含税）').label).toBe('销售额（含税）')
  })
})

describe('finding the table', () => {
  it('ignores the notes around a Markdown table', () => {
    const grid = extractGrid('Here you go:\n\n| a | b |\n|---|---|\n| x | 1 |\n| y | 2 |\n\nHope this helps!')
    expect(grid).toMatchObject({ format: 'markdown', header: ['a', 'b'], rows: [['x', '1'], ['y', '2']] })
  })

  it('reads quoted CSV cells with commas', () => {
    expect(extractGrid('name,note\n"Smith, J","said ""hi"""\nLee,ok')?.rows[0]).toEqual(['Smith, J', 'said "hi"'])
  })

  it('splits off the SQL query and reads its hints', () => {
    const grid = extractGrid("SELECT region, SUM(amount) AS total FROM sales GROUP BY region ORDER BY total DESC LIMIT 5;\n\nregion\ttotal\nEast\t10\nWest\t8")
    expect(grid?.sql).toContain('GROUP BY region')
    expect(parseSqlHints(grid!.sql!)).toMatchObject({
      groupBy: ['region'],
      aggregates: { total: 'sum' },
      orderBy: [{ name: 'total', desc: true }],
      limit: 5,
    })
  })

  it('resolves GROUP BY ordinals and ignores CTEs', () => {
    const hints = parseSqlHints(
      'WITH t AS (SELECT * FROM x GROUP BY y) SELECT date_trunc(\'week\', ts) AS week, avg(v) mean_v FROM t GROUP BY 1 ORDER BY 1',
    )
    expect(hints).toMatchObject({ groupBy: ['week'], aggregates: { mean_v: 'avg' }, timeParts: { week: 'date' } })
  })
})

describe('the 15 real-world tables', () => {
  it.each(FIXTURES.map((fixture) => [fixture.id, fixture] as const))('%s', (_, fixture) => {
    const table = analyzeText(fixture.text)
    expect(table).not.toBeNull()
    const [top] = recommend(table!)
    expect(top?.type).toBe(fixture.expect.type)
    if (fixture.expect.x !== undefined) expect(top.x?.label).toBe(fixture.expect.x)
    if (fixture.expect.series !== undefined) expect(top.series?.label).toBe(fixture.expect.series)
    if (fixture.expect.horizontal !== undefined) expect(Boolean(top.horizontal)).toBe(fixture.expect.horizontal)
    if (fixture.expect.shape) expect(table!.shape).toBe(fixture.expect.shape)
  })
})

/**
 * Ten more tables, written after the rules were fixed and run once without
 * tuning: 8 of 10 were right first time (European decimals and subtotal rows
 * in the middle of a table were not). Kept to guard those fixes.
 */
describe('tables written after the rules', () => {
  const T = (rows: string[][]) => rows.map((r) => r.join('\t')).join('\n')
  const cases: [string, string, string[]][] = [
    ['h1 store × weekday (Excel long)', T([['门店','星期','客流'],...['周一','周二','周三','周四','周五','周六','周日'].flatMap((d,i)=>[['南京西路店',d,String(820+i*40)],['徐家汇店',d,String(640+i*55)]])]), ['bar-grouped']],
    ['h2 daily temperature CSV', 'date,temp_c\n' + Array.from({length: 30}, (_, i) => `2024-07-${String(i+1).padStart(2,'0')},${(28 + Math.sin(i/3)*4).toFixed(1)}`).join('\n'), ['line']],
    ['h3 age bands', T([['年龄段','用户数'],['18-24','12,400'],['25-34','35,900'],['35-44','22,100'],['45-54','9,800'],['55+','4,300'],['<18','2,100']]), ['bar']],
    ['h4 year column, two measures', T([['年份','出生人口（万人）','死亡人口（万人）'],['2016','1786','977'],['2017','1723','986'],['2018','1523','993'],['2019','1465','998'],['2020','1202','998'],['2021','1062','1014'],['2022','956','1041'],['2023','902','1110']]), ['line']],
    ['h5 wide quarters no year', '| 区域 | Q1 | Q2 | Q3 | Q4 |\n|---|---|---|---|---|\n| 华东 | 320 | 410 | 380 | 520 |\n| 华南 | 210 | 260 | 240 | 330 |\n| 华北 | 180 | 205 | 220 | 290 |', ['line', 'bar-grouped']],
    ['h6 SQL avg salary', 'SELECT department, AVG(salary) AS avg_salary FROM employees GROUP BY department;\n\ndepartment\tavg_salary\nEngineering\t28500\nSales\t19800\nMarketing\t21200\nSupport\t14600\nFinance\t23900', ['bar']],
    ['h7 milestones', 'date,milestone\n2023-02-14,Seed round closed\n2023-06-01,First hire\n2023-11-20,Beta launch\n2024-03-05,1000 paying customers\n2024-09-18,Series A', ['timeline']],
    ['h8 European CSV', 'Land;Umsatz (€)\nDeutschland;1.234,50\nÖsterreich;456,20\nSchweiz;789,00\nNiederlande;612,75', ['bar']],
    ['h9 mid-table subtotals', T([['区域','城市','销售额'],['华东','上海','520'],['华东','杭州','310'],['华东','小计','830'],['华南','广州','450'],['华南','深圳','480'],['华南','小计','930']]), ['bar-stacked']],
    ['h10 percent mix per row', '| Device | 2022 | 2023 | 2024 |\n|---|---|---|---|\n| Mobile | 58% | 61% | 64% |\n| Desktop | 38% | 35% | 32% |\n| Tablet | 4% | 4% | 4% |', ['bar-stacked']],
  ]

  it.each(cases)('%s', (_, text, accepted) => {
    const table = analyzeText(text)
    expect(table).not.toBeNull()
    expect(accepted).toContain(recommend(table!)[0]?.type)
  })
})

describe('found by tables written after the rules', () => {
  it('reads European decimals', () => {
    expect(parseNumber('1.234,50')?.value).toBeCloseTo(1234.5)
    expect(parseNumber('456,20')?.value).toBeCloseTo(456.2)
    expect(parseNumber('1,234')?.value).toBe(1234)
  })

  it('drops subtotal rows in the middle of a table', () => {
    const table = analyzeText('区域\t城市\t销售额\n华东\t上海\t520\n华东\t杭州\t310\n华东\t小计\t830\n华南\t广州\t450\n华南\t小计\t450')
    expect(table?.rowCount).toBe(3)
    expect(table?.notes).toContainEqual({ code: 'dropped-summary-rows', labels: ['小计', '小计'] })
  })
})

describe('drawing rules', () => {
  const ctx = (lang: BuildContext['lang'] = 'zh-CN'): BuildContext => ({
    lang,
    colors: LIGHT,
    labels: { other: '其他', value: '数值', period: '时间' },
    width: 800,
  })
  const top = (id: string) => {
    const table = analyzeText(FIXTURES.find((f) => f.id === id)!.text)!
    return { table, rec: recommend(table)[0] }
  }

  it('formats 万 and 亿 in Chinese, K and M in English', () => {
    const plain = { prefix: '', suffix: '', percent: false }
    expect(formatValue(32000, { ...plain, prefix: '¥' }, 'zh-CN')).toBe('¥3.2万')
    expect(formatValue(4721870000000, { ...plain, suffix: '元' }, 'zh-CN')).toBe('4.72万亿元')
    expect(formatValue(120000000, plain, 'zh-CN')).toBe('1.2亿')
    expect(formatValue(1200000, { ...plain, prefix: '$' }, 'en')).toBe('$1.2M')
    expect(formatValue(12500, plain, 'en')).toBe('12.5K')
    expect(formatValue(0.125, { ...plain, percent: true }, 'en')).toBe('12.5%')
  })

  it('starts bars at zero and sorts unordered categories by value', () => {
    const { table, rec } = top('ai-markdown-city-gdp')
    const { option } = buildChart(rec, table, ctx())
    expect(option.yAxis).toMatchObject({ type: 'value', min: 0 })
    // 广州 (30,355.7) comes before 重庆 (30,145.8), though the table lists them the other way.
    const cities = (option.xAxis as { data: string[] }).data
    expect(cities.indexOf('广州')).toBeLessThan(cities.indexOf('重庆'))
  })

  it('keeps the order a SQL query asked for', () => {
    const { table, rec } = top('sql-top-products')
    const { option } = buildChart(rec, table, ctx('en'))
    expect((option.yAxis as { data: string[]; inverse: boolean }).data[0]).toBe('Wireless Earbuds Pro')
  })

  it('leaves gaps for missing values and fills missing periods', () => {
    const { table, rec } = top('excel-wide-region-month')
    const { option } = buildChart(rec, table, ctx())
    const series = option.series as { name: string; data: (number | null)[]; connectNulls: boolean; silent?: boolean }[]
    const north = series.find((s) => s.name === '华北' && !s.silent)!
    expect(north.connectNulls).toBe(false)
    expect(north.data[6]).toBeNull()
  })

  it('puts two units in two panels, never on two axes of one panel', () => {
    const { table, rec } = top('sheets-saas-metrics')
    const { option } = buildChart(rec, table, ctx('en'))
    expect(option.grid).toHaveLength(3)
    expect((option.yAxis as { gridIndex: number }[]).map((axis) => axis.gridIndex)).toEqual([0, 1, 2])
  })

  it('turns long labels into horizontal bars that wrap', () => {
    const { table, rec } = top('csv-survey-long-labels')
    const { option } = buildChart(rec, table, ctx('en'))
    expect(option.yAxis).toMatchObject({ type: 'category', inverse: true, axisLabel: { overflow: 'break' } })
  })

  type Series = { name: string; color: string; silent?: boolean; xAxisIndex?: number }

  it('gives one series the accent colour', () => {
    const { table, rec } = top('ai-markdown-city-gdp')
    const series = buildChart(rec, table, ctx()).option.series as Series[]
    expect(series.map((s) => s.color)).toEqual([LIGHT.accent])
  })

  it('steps ordered series up the ramp, earliest lightest', () => {
    const { table, rec } = top('ai-markdown-year-compare')
    const series = buildChart(rec, table, ctx()).option.series as Series[]
    expect(series.map((s) => s.name)).toEqual(['2023年', '2024年'])
    expect(series.map((s) => s.color)).toEqual([LIGHT.ramp[1], LIGHT.ramp[3]])
  })

  it('shades the parts of a stack by size, the largest darkest', () => {
    const { table, rec } = top('excel-channel-mix')
    const series = buildChart(rec, table, ctx()).option.series as Series[]
    expect(series.find((s) => s.name === '线上')?.color).toBe(LIGHT.ramp[3])
    expect(series.find((s) => s.name === '线下')?.color).toBe(LIGHT.ramp[1])
  })

  it('highlights the largest of up to three unordered lines and grays the rest', () => {
    const { table, rec } = top('csv-quarterly-long')
    const series = buildChart(rec, table, ctx('en')).option.series as Series[]
    expect(series.map((s) => [s.name, s.color])).toEqual([
      ['Notebook', LIGHT.accent],
      ['Tablet', LIGHT.context],
      ['Watch', LIGHT.context],
    ])
    const picked = buildChart(rec, table, { ...ctx('en'), highlight: 'Watch' }).option.series as Series[]
    expect(picked.find((s) => s.color === LIGHT.accent)?.name).toBe('Watch')
  })

  it('splits more than three unordered lines into panels on one scale', () => {
    const { table, rec } = top('excel-wide-region-month')
    const { option } = buildChart(rec, table, ctx())
    expect(option.grid).toHaveLength(5)
    const axes = option.yAxis as { min: number; max: number }[]
    expect(new Set(axes.map((a) => `${a.min}-${a.max}`)).size).toBe(1)
    const main = (option.series as Series[]).filter((s) => !s.silent)
    expect(main.map((s) => s.color)).toEqual(Array(5).fill(LIGHT.accent))
  })

  it('uses no more than the ramp, whatever the chart', () => {
    const allowed = new Set([...LIGHT.ramp, LIGHT.accent, LIGHT.context])
    for (const fixture of FIXTURES) {
      const table = analyzeText(fixture.text)!
      for (const rec of recommend(table).slice(0, 3)) {
        const { option } = buildChart(rec, table, ctx())
        for (const s of option.series as { color?: string; data?: { itemStyle?: { color: string } }[] }[]) {
          if (s.color) expect(allowed, `${fixture.id} ${rec.type}`).toContain(s.color)
          for (const d of s.data ?? []) if (d && typeof d === 'object' && 'itemStyle' in d && d.itemStyle) expect(allowed).toContain(d.itemStyle.color)
        }
      }
    }
  })

  it('keeps every row of a heatmap', () => {
    const { table, rec } = top('sql-mysql-weekday-hour')
    const { option } = buildChart(rec, table, ctx())
    expect((option.yAxis as { data: string[] }).data).toEqual(['1', '2', '3', '4', '5', '6', '7'])
  })
})
