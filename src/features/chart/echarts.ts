/**
 * The ECharts runtime, cut down to the six chart types data2tu draws and the
 * components they use. Loaded on demand by the chart page.
 */
import { BarChart, CustomChart, HeatmapChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TitleComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import { init, registerTheme, use as register } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { DARK, LIGHT, THEME_NAME, echartsTheme } from './theme'

register([BarChart, LineChart, ScatterChart, HeatmapChart, PieChart, CustomChart, GridComponent, LegendComponent, TitleComponent, TooltipComponent, VisualMapComponent, SVGRenderer])
registerTheme(THEME_NAME.light, echartsTheme(LIGHT))
registerTheme(THEME_NAME.dark, echartsTheme(DARK))

export { init }
