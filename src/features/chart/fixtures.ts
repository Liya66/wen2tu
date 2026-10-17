/**
 * Fifteen tables as people actually paste them — Excel and Sheets copies,
 * AI-written Markdown with notes around it, Chinese units, a wide table,
 * schedules, and SQL results with their queries — each with the chart a
 * person would expect. Used by the tests and as samples on the chart page.
 */
import type { ChartType } from './recommend'

export interface Fixture {
  id: string
  name: { zh: string; en: string }
  text: string
  expect: {
    type: ChartType
    /** Label of the column on the category/time axis (for a wide table: the period axis is ''). */
    x?: string
    series?: string
    horizontal?: boolean
    shape?: 'long' | 'wide'
  }
}

const tsv = (rows: (string | number)[][]) => rows.map((row) => row.join('\t')).join('\n')

// A week of sessions by hour, as MySQL prints it: busy weekday afternoons, quiet nights.
const sessionsByHour = (() => {
  const lines = [
    "mysql> SELECT DAYOFWEEK(started_at) AS weekday, HOUR(started_at) AS hour, COUNT(*) AS sessions",
    '    -> FROM sessions',
    "    -> WHERE started_at >= '2024-09-01' AND started_at < '2024-10-01'",
    '    -> GROUP BY weekday, hour',
    '    -> ORDER BY weekday, hour;',
    '+---------+------+----------+',
    '| weekday | hour | sessions |',
    '+---------+------+----------+',
  ]
  for (let day = 1; day <= 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const weekend = day === 1 || day === 7
      const daytime = Math.max(0, Math.sin(((hour - 6) / 16) * Math.PI))
      const sessions = Math.round(8 + daytime * (weekend ? 90 : 240) + ((day * 31 + hour * 17) % 23))
      lines.push(`| ${String(day).padStart(7)} | ${String(hour).padStart(4)} | ${String(sessions).padStart(8)} |`)
    }
  }
  lines.push('+---------+------+----------+', '168 rows in set (0.04 sec)')
  return lines.join('\n')
})()

export const FIXTURES: Fixture[] = [
  {
    id: 'excel-monthly-sales',
    name: { zh: 'Excel：月度销售（含标题行和合计行）', en: 'Excel: monthly sales with a title and total row' },
    text:
      tsv([
        ['2024年月度销售汇总', '', '', ''],
        ['月份', '销售额', '订单数', ''],
        ['2024年1月', '¥1,234,500', '3,210', ''],
        ['2024年2月', '¥986,200', '2,874', ''],
        ['2024年3月', '¥1,402,800', '3,655', ''],
        ['2024年4月', '¥1,388,100', '3,590', ''],
        ['2024年5月', '¥1,520,300', '3,902', ''],
        ['2024年6月', '¥1,733,900', '4,410', ''],
        ['2024年7月', '¥1,610,000', '—', ''],
        ['2024年8月', '¥1,585,400', '4,020', ''],
        ['2024年9月', '¥1,702,600', '4,315', ''],
        ['2024年10月', '¥1,904,300', '4,880', ''],
        ['2024年11月', '¥2,410,700', '6,120', ''],
        ['2024年12月', '¥2,105,000', '5,370', ''],
        ['合计', '¥19,583,800', '46,346', ''],
      ]) + '\n',
    expect: { type: 'line', x: '月份', shape: 'long' },
  },
  {
    id: 'ai-markdown-city-gdp',
    name: { zh: 'AI 回答：城市 GDP 表格（前后有说明）', en: 'AI answer: city GDP table with notes' },
    text: `当然！以下是 2023 年 GDP 排名前十的中国城市：

| 排名 | 城市 | GDP（亿元） | 增速 |
|---|---|---|---|
| 1 | 上海 | 47,218.7 | 5.0% |
| 2 | 北京 | 43,760.7 | 5.2% |
| 3 | 深圳 | 34,606.4 | 6.0% |
| 4 | 广州 | 30,355.7 | 4.6% |
| 5 | 重庆 | 30,145.8 | 6.1% |
| 6 | 苏州 | 24,653.4 | 4.6% |
| 7 | 成都 | 22,074.7 | 6.0% |
| 8 | 杭州 | 20,059.0 | 5.6% |
| 9 | 武汉 | 20,011.7 | — |
| 10 | 南京 | 17,421.4 | 4.6% |

> 注：数据来源于各市统计公报，**增速**按不变价计算。如需按人均 GDP 排名，请告诉我。`,
    expect: { type: 'bar', x: '城市', horizontal: false },
  },
  {
    id: 'csv-quarterly-long',
    name: { zh: 'CSV：按季度、按产品的营收（长表）', en: 'CSV: revenue by quarter and product (long)' },
    text: `quarter,product,revenue
2023 Q1,Notebook,"$1,204,000"
2023 Q1,Tablet,"$640,500"
2023 Q1,Watch,"$212,300"
2023 Q2,Notebook,"$1,310,200"
2023 Q2,Tablet,"$598,000"
2023 Q2,Watch,"$260,900"
2023 Q3,Notebook,"$1,280,700"
2023 Q3,Tablet,"$612,400"
2023 Q3,Watch,
2023 Q4,Notebook,"$1,655,000"
2023 Q4,Tablet,"$802,100"
2023 Q4,Watch,"$395,600"
2024 Q1,Notebook,"$1,342,800"
2024 Q1,Tablet,"$577,900"
2024 Q1,Watch,"$301,200"
2024 Q2,Notebook,"$1,401,500"
2024 Q2,Tablet,"$560,300"
2024 Q2,Watch,"$344,800"
`,
    expect: { type: 'line', x: 'quarter', series: 'product', shape: 'long' },
  },
  {
    id: 'excel-wide-region-month',
    name: { zh: 'Excel：各地区 × 月份（宽表，万）', en: 'Excel: region × month (wide, 万)' },
    text: tsv([
      ['各地区月度销售额', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['地区', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '合计'],
      ['华东', '125.3万', '98.6万', '140.2万', '138.8万', '152.0万', '173.4万', '161.0万', '158.5万', '170.3万', '190.4万', '241.1万', '210.5万', '1960.1万'],
      ['华南', '88.1万', '70.4万', '95.6万', '99.2万', '104.8万', '118.3万', '112.6万', '109.9万', '115.0万', '128.7万', '166.2万', '150.8万', '1359.6万'],
      ['华北', '76.5万', '61.2万', '84.0万', '86.3万', '90.1万', '97.6万', '—', '93.8万', '99.4万', '110.2万', '138.5万', '121.9万', '1059.5万'],
      ['西南', '45.2万', '39.8万', '50.6万', '52.3万', '55.9万', '61.0万', '58.7万', '57.2万', '60.8万', '66.5万', '84.1万', '75.3万', '707.4万'],
      ['西北', '21.7万', '18.9万', '24.4万', '25.0万', '26.8万', '29.3万', '28.1万', '27.5万', '29.0万', '31.6万', '40.2万', '35.9万', '338.4万'],
      ['合计', '356.8万', '288.9万', '394.8万', '401.6万', '429.6万', '479.6万', '360.4万', '446.9万', '474.5万', '527.4万', '670.1万', '594.4万', '5425.0万'],
    ]),
    expect: { type: 'line', x: '', series: '地区', shape: 'wide' },
  },
  {
    id: 'ai-markdown-share',
    name: { zh: 'AI 回答：流量来源占比', en: 'AI answer: traffic source share' },
    text: `Here's the breakdown of traffic sources for September:

| Source | Share |
|:--|--:|
| Organic search | 42.5% |
| Direct | 23.1% |
| Social | 18.4% |
| Referral | 9.8% |
| Email | 6.2% |

Organic search remains the dominant channel, while email is still small.`,
    expect: { type: 'donut', x: 'Source' },
  },
  {
    id: 'sheets-project-plan',
    name: { zh: '表格：项目计划（开始/结束日期）', en: 'Sheets: project plan with start/end dates' },
    text: tsv([
      ['任务', '负责人', '开始', '结束', '状态'],
      ['需求调研', '王芳', '2024-03-01', '2024-03-15', '完成'],
      ['原型设计', '李雷', '2024-03-11', '2024-03-29', '完成'],
      ['技术方案评审', '张伟', '2024-03-25', '2024-04-03', '完成'],
      ['前端开发', '李雷', '2024-04-01', '2024-05-17', '进行中'],
      ['后端开发', '张伟', '2024-04-01', '2024-05-24', '进行中'],
      ['联调测试', '王芳', '2024-05-20', '2024-06-07', '未开始'],
      ['上线发布', '张伟', '2024-06-10', '2024-06-12', '未开始'],
    ]),
    expect: { type: 'timeline' },
  },
  {
    id: 'ai-markdown-roadmap',
    name: { zh: 'AI 回答：路线图（时间段在一个单元格里）', en: 'AI answer: roadmap with ranges in one cell' },
    text: `Sure — here is a rough roadmap you could start from:

| Phase | Period | Owner |
| --- | --- | --- |
| **Discovery** | Jan 2024 – Feb 2024 | Design |
| MVP build | Mar 2024 – Jun 2024 | Engineering |
| Private beta | Jun 2024 – Aug 2024 | Product |
| Public launch | Sep 2024 – Sep 2024 | Marketing |
| Scale & iterate | Oct 2024 – Mar 2025 | Everyone |

Let me know if you'd like this broken down by week.`,
    expect: { type: 'timeline' },
  },
  {
    id: 'sql-psql-monthly-orders',
    name: { zh: 'SQL：月度订单（psql 输出 + 查询）', en: 'SQL: monthly orders (psql output + query)' },
    text: `SELECT date_trunc('month', created_at)::date AS month,
       count(*) AS orders,
       round(avg(total_amount), 2) AS avg_order_value
FROM orders
WHERE created_at >= '2024-01-01'
GROUP BY 1
ORDER BY 1;

   month    | orders | avg_order_value
------------+--------+-----------------
 2024-01-01 |   1834 |           62.40
 2024-02-01 |   1702 |           60.85
 2024-03-01 |   2011 |           63.10
 2024-04-01 |   2140 |           64.75
 2024-05-01 |   2298 |           63.90
 2024-06-01 |   2455 |           66.20
 2024-07-01 |   2390 |           65.05
 2024-08-01 |   2512 |           67.80
 2024-09-01 |   2733 |           68.35
(9 rows)
`,
    expect: { type: 'line', x: 'month' },
  },
  {
    id: 'sql-mysql-weekday-hour',
    name: { zh: 'SQL：星期 × 小时的会话数（MySQL）', en: 'SQL: sessions by weekday × hour (MySQL)' },
    text: sessionsByHour,
    expect: { type: 'heatmap' },
  },
  {
    id: 'csv-countries',
    name: { zh: 'CSV：各国人均 GDP 与预期寿命', en: 'CSV: GDP per capita vs life expectancy' },
    text: `Country,GDP per capita (USD),Life expectancy (years),Population (M)
Japan,"33,950",84.5,124.5
Germany,"52,750",81.0,84.5
United States,"80,410",77.4,334.9
Brazil,"10,040",75.9,216.4
India,"2,480",70.8,1428.6
China,"12,610",78.6,1410.7
Nigeria,"1,620",53.9,223.8
Mexico,"13,800",75.0,128.5
Indonesia,"4,940",71.7,277.5
South Africa,"6,020",62.3,60.4
France,"46,320",82.5,68.2
Vietnam,"4,350",74.6,98.9`,
    expect: { type: 'scatter' },
  },
  {
    id: 'excel-channel-mix',
    name: { zh: 'Excel：线上/线下/合计（万元）', en: 'Excel: online / offline / total (万元)' },
    text: tsv([
      ['月份', '线上（万元）', '线下（万元）', '合计（万元）'],
      ['1月', '320.5', '210.2', '530.7'],
      ['2月', '298.0', '180.6', '478.6'],
      ['3月', '356.4', '222.9', '579.3'],
      ['4月', '371.2', '230.5', '601.7'],
      ['5月', '402.8', '228.1', '630.9'],
      ['6月', '466.0', '241.3', '707.3'],
    ]),
    expect: { type: 'bar-stacked', x: '月份', shape: 'wide' },
  },
  {
    id: 'ai-markdown-year-compare',
    name: { zh: 'AI 回答：2023 vs 2024（亿/万混用）', en: 'AI answer: 2023 vs 2024 (亿 and 万 mixed)' },
    text: `以下是各产品线 2023 与 2024 年的营收对比：

| 产品线 | 2023 | 2024 |
| --- | --- | --- |
| 云服务 | 1.25亿 | 1.83亿 |
| 硬件 | 8,760万 | 7,980万 |
| 软件授权 | 5,430万 | 6,120万 |
| 咨询 | 2,310万 | — |
| 培训 | 980万 | 1,250万 |

2024 年云服务增长最快；咨询业务数据暂未公布。`,
    expect: { type: 'bar-grouped', x: '产品线', series: '', shape: 'wide' },
  },
  {
    id: 'csv-survey-long-labels',
    name: { zh: 'CSV：调查问卷（很长的选项）', en: 'CSV: survey with long answer labels' },
    text: `"Which of these slow your team down the most? (select all that apply)",Responses
"Switching between too many tools to find the latest version of a document",412
"Meetings that could have been an email",388
"Unclear ownership of decisions, so work stalls waiting for approval",201
"Waiting on reviews from people in other time zones",276
"Notifications from chat interrupting focused work",344
"Onboarding new teammates without written documentation",157
"Re-doing work because requirements changed late",298
Other,46
`,
    expect: { type: 'bar', horizontal: true },
  },
  {
    id: 'sheets-saas-metrics',
    name: { zh: 'Sheets：月活、营收、转化率（K/M/%）', en: 'Sheets: users, revenue, conversion (K/M/%)' },
    text: tsv([
      ['Month', 'Active users', 'Revenue', 'Conversion'],
      ['Jan-24', '12.5K', '$1.2M', '3.1%'],
      ['Feb-24', '13.1K', '$1.25M', '3.0%'],
      ['Mar-24', '14.8K', '$1.41M', '3.3%'],
      ['Apr-24', '15.2K', '', 'N/A'],
      ['May-24', '16.9K', '$1.62M', '3.6%'],
      ['Jun-24', '18.4K', '$1.80M', '3.8%'],
      ['Jul-24', '18.1K', '$1.77M', '3.7%'],
      ['Aug-24', '19.6K', '$1.95M', '3.9%'],
    ]),
    expect: { type: 'line', x: 'Month' },
  },
  {
    id: 'sql-top-products',
    name: { zh: 'SQL：销售额前 8 的商品（查询 + 结果）', en: 'SQL: top 8 products (query + result)' },
    text: `\`\`\`sql
SELECT p.name AS product,
       SUM(oi.quantity * oi.unit_price) AS revenue
FROM order_items oi
JOIN products p ON p.id = oi.product_id
WHERE oi.created_at >= DATE '2024-01-01'
GROUP BY p.name
ORDER BY revenue DESC
LIMIT 8;
\`\`\`

product\trevenue
Wireless Earbuds Pro\t482910.50
Smart Watch S3\t371204.00
USB-C Hub 7-in-1\t198330.25
Mechanical Keyboard\t176455.90
4K Webcam\t142087.10
Laptop Stand\t98760.00
Noise Cancelling Headphones\t95112.35
Portable SSD 1TB\t90310.80
`,
    expect: { type: 'bar', x: 'product' },
  },
]
