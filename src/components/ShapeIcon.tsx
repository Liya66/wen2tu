import { previewParts } from '../features/appearance/nodeShapes'
import type { NodeShape } from '../features/mindmap/types'

interface Props {
  shape: NodeShape
  width?: number
  height?: number
  stroke?: string
  fill?: string
}

/** A small drawing of a topic shape (style panel, template previews). */
export function ShapeIcon({ shape, width = 40, height = 24, stroke = 'currentColor', fill = 'transparent' }: Props) {
  const pad = 2
  const w = width - pad * 2
  const h = height - pad * 2
  return (
    <svg
      width={width}
      height={height}
      viewBox={`${-pad} ${-pad} ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
      className="shape-icon"
    >
      {previewParts(shape, w, h).map((part, index) => (
        <path
          key={index}
          d={part.d}
          fill={part.accent ? stroke : part.hollow ? 'none' : fill}
          fillRule="evenodd"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}
