import type { TerminalPtyGeometry } from '../../../shared/contracts/dto'

const TERMINAL_NODE_HEADER_HEIGHT_PX = 34
const TERMINAL_NODE_XTERM_HORIZONTAL_PADDING_PX = 16
const TERMINAL_NODE_XTERM_VERTICAL_PADDING_PX = 16
const TERMINAL_NODE_XTERM_SCROLLBAR_GUTTER_PX = 10
const ESTIMATED_TERMINAL_CELL_WIDTH_RATIO = 0.6
const ESTIMATED_TERMINAL_CELL_HEIGHT_RATIO = 1.15

export const DEFAULT_PTY_COLS = 80
export const DEFAULT_PTY_ROWS = 24

export interface TerminalPtyGeometryDisplayMetrics {
  fontSize: number
  lineHeight?: number
  letterSpacing?: number
  cssCellWidth?: number | null
  cssCellHeight?: number | null
}

function clampPtyDimension(value: number, fallback: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }

  const normalized = Math.floor(value)
  if (normalized <= 0) {
    return fallback
  }

  return Math.min(max, Math.max(1, normalized))
}

function resolvePositiveNumber(value: number | null | undefined, fallback: number): number {
  return Number.isFinite(value) && typeof value === 'number' && value > 0 ? value : fallback
}

function resolveFiniteNumber(value: number | null | undefined, fallback: number): number {
  return Number.isFinite(value) && typeof value === 'number' ? value : fallback
}

export function resolveTerminalPtyGeometryForNodeFrame({
  width,
  height,
  terminalFontSize,
  displayMetrics,
}: {
  width: number
  height: number
  terminalFontSize: number
  displayMetrics?: TerminalPtyGeometryDisplayMetrics | null
}): TerminalPtyGeometry {
  const fontSize = resolvePositiveNumber(displayMetrics?.fontSize, terminalFontSize)
  const resolvedFontSize = resolvePositiveNumber(fontSize, 13)
  const lineHeight = resolvePositiveNumber(displayMetrics?.lineHeight, 1)
  const letterSpacing = resolveFiniteNumber(displayMetrics?.letterSpacing, 0)
  const contentWidth =
    width - TERMINAL_NODE_XTERM_HORIZONTAL_PADDING_PX - TERMINAL_NODE_XTERM_SCROLLBAR_GUTTER_PX
  const contentHeight =
    height - TERMINAL_NODE_HEADER_HEIGHT_PX - TERMINAL_NODE_XTERM_VERTICAL_PADDING_PX
  const measuredCellWidth = resolvePositiveNumber(displayMetrics?.cssCellWidth, 0)
  const measuredCellHeight = resolvePositiveNumber(displayMetrics?.cssCellHeight, 0)
  const cellWidth = Math.max(
    1,
    measuredCellWidth > 0
      ? measuredCellWidth
      : resolvedFontSize * ESTIMATED_TERMINAL_CELL_WIDTH_RATIO + letterSpacing,
  )
  const cellHeight = Math.max(
    1,
    measuredCellHeight > 0
      ? measuredCellHeight
      : resolvedFontSize * lineHeight * ESTIMATED_TERMINAL_CELL_HEIGHT_RATIO,
  )

  return {
    cols: clampPtyDimension(contentWidth / cellWidth, DEFAULT_PTY_COLS, 300),
    rows: clampPtyDimension(contentHeight / cellHeight, DEFAULT_PTY_ROWS, 120),
  }
}
