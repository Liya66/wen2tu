import type { MapTemplate } from '../features/appearance/templates'
import { previewParts } from '../features/appearance/nodeShapes'
import { findPreset, systemTheme } from '../features/appearance/themes'
import type { NodeShape } from '../features/mindmap/types'

/** A topic drawn in the preview: its shape (or a rounded box) at a position. */
function Topic({
  x,
  y,
  w,
  h,
  shape,
  stroke,
  fill,
}: {
  x: number
  y: number
  w: number
  h: number
  shape: NodeShape | undefined
  stroke: string
  fill: string
}) {
  if (!shape) return <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} stroke={stroke} strokeWidth={1.4} />
  return (
    <g transform={`translate(${x} ${y})`}>
      {previewParts(shape, w, h).map((part, index) => (
        <path
          key={index}
          d={part.d}
          fill={part.accent ? stroke : part.hollow ? 'none' : fill}
          fillRule="evenodd"
          stroke={stroke}
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
      ))}
    </g>
  )
}

/** A miniature of a template: its colors, layout side and topic shapes. */
export function TemplatePreview({ template, prefersDark }: { template: MapTemplate; prefersDark: boolean }) {
  const theme = (template.theme && findPreset(template.theme)) || systemTheme(prefersDark)
  const vars = theme.cssVar
  const [rootShape, mainShape, subShape] = template.levels ?? []
  const width = 160
  const height = 72
  const right = template.direction === 1
  const root = right
    ? { x: 8, y: height / 2 - 9, w: 46, h: 18 }
    : { x: width / 2 - 23, y: height / 2 - 9, w: 46, h: 18 }
  const branches = right
    ? [
        { x: 84, y: 8 },
        { x: 84, y: 28 },
        { x: 84, y: 48 },
      ]
    : [
        { x: 6, y: 12 },
        { x: 6, y: 44 },
        { x: 120, y: 12 },
        { x: 120, y: 44 },
      ]
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="template-preview" aria-hidden="true" focusable="false">
      <rect width={width} height={height} fill={vars['--bgcolor']} />
      {branches.map((b, index) => {
        const color = theme.palette[index % theme.palette.length]
        const left = b.x < root.x
        const fromX = left ? root.x : root.x + root.w
        const toX = left ? b.x + 34 : b.x
        const toY = b.y + 7
        return (
          <g key={index}>
            <path
              d={`M ${fromX} ${height / 2} C ${(fromX + toX) / 2} ${height / 2} ${(fromX + toX) / 2} ${toY} ${toX} ${toY}`}
              fill="none"
              stroke={color}
              strokeWidth={1.4}
            />
            <Topic x={b.x} y={b.y} w={34} h={14} shape={mainShape} stroke={color} fill={vars['--main-bgcolor'] ?? '#fff'} />
            {subShape && right && (
              <Topic x={b.x + 44} y={b.y + 1} w={26} h={12} shape={subShape} stroke={color} fill={vars['--bgcolor'] ?? '#fff'} />
            )}
          </g>
        )
      })}
      <Topic
        {...root}
        shape={rootShape}
        stroke={vars['--root-bgcolor'] ?? '#2c2d35'}
        fill={vars['--root-bgcolor'] ?? '#2c2d35'}
      />
    </svg>
  )
}
