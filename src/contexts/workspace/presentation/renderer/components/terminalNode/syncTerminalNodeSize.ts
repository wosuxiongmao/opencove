import type { MutableRefObject } from 'react'
import type { FitAddon } from '@xterm/addon-fit'
import type { Terminal } from '@xterm/xterm'
import type { TerminalGeometryCommitReason } from '@shared/contracts/dto'
import { resolveStablePtySize } from '../../utils/terminalResize'
import {
  captureTerminalDiagnosticsSnapshot,
  captureTerminalLayoutDiagnostics,
  createTerminalDiagnosticsLogger,
} from './diagnostics'
import { resizeTerminalPreservingScrollState } from './effectiveDevicePixelRatio'
import {
  readTerminalRenderDimensionsSafely,
  runTerminalRenderMutationSafely,
} from './renderServiceSafety'

type PtySize = { cols: number; rows: number }
export type InitialTerminalNodeGeometryCommitResult = PtySize & { changed: boolean }

type StableMeasuredGeometrySample = PtySize & {
  containerWidth: number
  containerHeight: number
  renderCellWidth: number | null
  renderCellHeight: number | null
  renderCanvasWidth: number | null
  renderCanvasHeight: number | null
}

const DOM_RENDERER_TEXT_OVERHANG_SAFETY_CELLS = 1
const DOM_RENDERER_TEXT_OVERHANG_EPSILON_PX = 0.5
const DOM_RENDERER_DIMENSION_EPSILON_PX = 0.5
const DOM_RENDERER_SCROLLBAR_GAP_SAFETY_CELLS = 1
const DOM_RENDERER_GLYPH_SCROLLBAR_GAP_SAFETY_CELLS = 2
const STABLE_MEASURED_GEOMETRY_MIN_SAMPLES = 4
const STABLE_MEASURED_GEOMETRY_MAX_ATTEMPTS = 8

type TerminalGeometryRefs = {
  terminalRef: MutableRefObject<Terminal | null>
  fitAddonRef: MutableRefObject<FitAddon | null>
  containerRef: MutableRefObject<HTMLElement | null>
  isPointerResizingRef: MutableRefObject<boolean>
  lastCommittedPtySizeRef: MutableRefObject<PtySize | null>
}

type FitTerminalNodeOptions = {
  refreshWhenStable?: boolean
  logWhenStable?: boolean
}

function isTerminalDiagnosticsEnabled(): boolean {
  return window.opencoveApi?.meta?.enableTerminalDiagnostics === true
}

function logTerminalGeometryDiagnostics({
  event,
  terminal,
  fitAddon,
  container,
  sessionId,
  reason,
  lastCommittedPtySize,
  measured,
  nextPtySize,
  skippedReason,
  extraDetails,
}: {
  event: string
  terminal: Terminal | null
  fitAddon: FitAddon | null
  container: HTMLElement | null
  sessionId: string | null
  reason?: TerminalGeometryCommitReason | null
  lastCommittedPtySize?: PtySize | null
  measured?: PtySize | null
  nextPtySize?: PtySize | null
  skippedReason?: string | null
  extraDetails?: Record<string, string | number | boolean | null>
}): void {
  if (!isTerminalDiagnosticsEnabled() || !terminal) {
    return
  }

  const logger = createTerminalDiagnosticsLogger({
    enabled: true,
    emit: window.opencoveApi?.debug?.logTerminalDiagnostics ?? (() => undefined),
    base: {
      source: 'renderer-terminal',
      nodeId: 'unknown',
      sessionId: sessionId ?? 'unknown',
      nodeKind: 'terminal',
      title: 'terminal-geometry',
    },
  })
  const viewportElement =
    container?.querySelector('.xterm-viewport') instanceof HTMLElement
      ? (container.querySelector('.xterm-viewport') as HTMLElement)
      : null
  const proposed = (() => {
    try {
      return fitAddon?.proposeDimensions() ?? null
    } catch {
      return null
    }
  })()

  logger.log(event, captureTerminalDiagnosticsSnapshot(terminal, viewportElement), {
    reason: reason ?? null,
    skippedReason: skippedReason ?? null,
    measuredCols: measured?.cols ?? null,
    measuredRows: measured?.rows ?? null,
    proposedCols: proposed?.cols ?? null,
    proposedRows: proposed?.rows ?? null,
    nextCols: nextPtySize?.cols ?? null,
    nextRows: nextPtySize?.rows ?? null,
    lastCommittedCols: lastCommittedPtySize?.cols ?? null,
    lastCommittedRows: lastCommittedPtySize?.rows ?? null,
    pointerResizing: null,
    ...captureTerminalLayoutDiagnostics({ terminal, container, proposedCols: proposed?.cols }),
    ...(extraDetails ?? {}),
  })
}

function logDomTextOverhangSchedulerDiagnostics({
  event,
  terminal,
  fitAddon,
  container,
  sessionId,
  lastCommittedPtySize,
  skippedReason,
  remainingFrames,
  suppressPtyResize,
}: {
  event: string
  terminal: Terminal | null
  fitAddon: FitAddon | null
  container: HTMLElement | null
  sessionId: string | null
  lastCommittedPtySize?: PtySize | null
  skippedReason?: string | null
  remainingFrames?: number | null
  suppressPtyResize?: boolean | null
}): void {
  logTerminalGeometryDiagnostics({
    event,
    terminal,
    fitAddon,
    container,
    sessionId,
    reason: 'appearance_commit',
    lastCommittedPtySize: lastCommittedPtySize ?? null,
    skippedReason: skippedReason ?? null,
    extraDetails: {
      remainingFrames: remainingFrames ?? null,
      suppressPtyResize: suppressPtyResize ?? null,
    },
  })
}

/**
 * After xterm resizes, the element can end up slightly taller than `rows × cellHeight`
 * because the row count is floored while the container height is not. Clamping the
 * element height removes the dead zone that can otherwise show a duplicate cursor.
 */
function clampXtermHeightToExactRows(terminal: Terminal): void {
  const xtermEl = terminal.element
  if (!xtermEl) {
    return
  }

  const cellHeight = readTerminalRenderDimensionsSafely(terminal)?.css?.cell?.height
  if (typeof cellHeight !== 'number' || !Number.isFinite(cellHeight) || cellHeight <= 0) {
    return
  }

  const contentHeight = Math.floor(terminal.rows * cellHeight)
  const computedStyle =
    typeof window.getComputedStyle === 'function' ? window.getComputedStyle(xtermEl) : null
  const parsePixelValue = (value: string | undefined): number => {
    const parsed = Number.parseFloat(value ?? '')
    return Number.isFinite(parsed) ? parsed : 0
  }
  const verticalPadding =
    parsePixelValue(computedStyle?.paddingTop) + parsePixelValue(computedStyle?.paddingBottom)
  const exactHeight =
    computedStyle?.boxSizing === 'border-box' ? contentHeight + verticalPadding : contentHeight
  xtermEl.style.height = `${exactHeight}px`
}

function syncDomRendererDimensionsToCurrentGeometry({
  terminal,
  container,
}: {
  terminal: Terminal
  container: HTMLElement | null
}): void {
  if (container?.dataset?.coveTerminalRenderer !== 'dom') {
    return
  }

  const renderDimensions = readTerminalRenderDimensionsSafely(terminal)
  const cssCellWidth = renderDimensions?.css?.cell?.width
  const cssCellHeight = renderDimensions?.css?.cell?.height
  const cssCanvasWidth = renderDimensions?.css?.canvas?.width
  const cssCanvasHeight = renderDimensions?.css?.canvas?.height

  if (
    typeof cssCellWidth !== 'number' ||
    typeof cssCellHeight !== 'number' ||
    typeof cssCanvasWidth !== 'number' ||
    typeof cssCanvasHeight !== 'number' ||
    !Number.isFinite(cssCellWidth) ||
    !Number.isFinite(cssCellHeight) ||
    !Number.isFinite(cssCanvasWidth) ||
    !Number.isFinite(cssCanvasHeight) ||
    cssCellWidth <= 0 ||
    cssCellHeight <= 0
  ) {
    return
  }

  const expectedCanvasWidth = terminal.cols * cssCellWidth
  const expectedCanvasHeight = terminal.rows * cssCellHeight
  const hasStaleDimensions = (dimensions: typeof renderDimensions): boolean => {
    const currentCssCanvasWidth = dimensions?.css?.canvas?.width
    const currentCssCanvasHeight = dimensions?.css?.canvas?.height
    return (
      typeof currentCssCanvasWidth !== 'number' ||
      typeof currentCssCanvasHeight !== 'number' ||
      !Number.isFinite(currentCssCanvasWidth) ||
      !Number.isFinite(currentCssCanvasHeight) ||
      Math.abs(currentCssCanvasWidth - expectedCanvasWidth) > DOM_RENDERER_DIMENSION_EPSILON_PX ||
      Math.abs(currentCssCanvasHeight - expectedCanvasHeight) > DOM_RENDERER_DIMENSION_EPSILON_PX
    )
  }

  if (!hasStaleDimensions(renderDimensions)) {
    return
  }

  const internalTerminal = terminal as Terminal & {
    _core?: {
      _renderService?: {
        handleResize?: (cols: number, rows: number) => void
        _renderer?: {
          value?: {
            handleResize?: (cols: number, rows: number) => void
          }
        }
      }
    }
  }
  runTerminalRenderMutationSafely(() => {
    const renderService = internalTerminal._core?._renderService
    if (typeof renderService?.handleResize === 'function') {
      renderService.handleResize(terminal.cols, terminal.rows)
      if (!hasStaleDimensions(readTerminalRenderDimensionsSafely(terminal))) {
        return
      }
    }

    renderService?._renderer?.value?.handleResize?.(terminal.cols, terminal.rows)
  })
}

function canRefreshTerminalLayout(input: {
  terminal: Terminal | null
  container: HTMLElement | null
  isPointerResizingRef: MutableRefObject<boolean>
}): boolean {
  if (!input.terminal || !input.container) {
    return false
  }

  if (input.container.clientWidth <= 2 || input.container.clientHeight <= 2) {
    return false
  }

  if (input.isPointerResizingRef.current) {
    return false
  }

  return true
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise(resolve => {
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        resolve()
      })
      return
    }

    window.setTimeout(resolve, 0)
  })
}

function isSameStableMeasuredGeometrySample(
  previous: StableMeasuredGeometrySample | null,
  next: StableMeasuredGeometrySample,
): boolean {
  return (
    previous !== null &&
    previous.cols === next.cols &&
    previous.rows === next.rows &&
    previous.containerWidth === next.containerWidth &&
    previous.containerHeight === next.containerHeight &&
    previous.renderCellWidth === next.renderCellWidth &&
    previous.renderCellHeight === next.renderCellHeight &&
    previous.renderCanvasWidth === next.renderCanvasWidth &&
    previous.renderCanvasHeight === next.renderCanvasHeight
  )
}

function normalizeSampleNumber(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }

  return Math.round(value * 100) / 100
}

function createStableMeasuredGeometrySample({
  terminal,
  container,
  measured,
}: {
  terminal: Terminal
  container: HTMLElement
  measured: PtySize
}): StableMeasuredGeometrySample {
  const renderDimensions = readTerminalRenderDimensionsSafely(terminal)
  return {
    cols: measured.cols,
    rows: measured.rows,
    containerWidth: container.clientWidth,
    containerHeight: container.clientHeight,
    renderCellWidth: normalizeSampleNumber(renderDimensions?.css?.cell?.width),
    renderCellHeight: normalizeSampleNumber(renderDimensions?.css?.cell?.height),
    renderCanvasWidth: normalizeSampleNumber(renderDimensions?.css?.canvas?.width),
    renderCanvasHeight: normalizeSampleNumber(renderDimensions?.css?.canvas?.height),
  }
}

function readMaxRowRight(rowsElement: Element, toLocalX: (value: number) => number): number | null {
  let maxRowRight: number | null = null
  for (const row of rowsElement.querySelectorAll(':scope > div')) {
    const rect = row.getBoundingClientRect()
    if (!Number.isFinite(rect.right)) {
      continue
    }

    const localRight = toLocalX(rect.right)
    if (!Number.isFinite(localRight)) {
      continue
    }

    maxRowRight = maxRowRight === null ? localRight : Math.max(maxRowRight, localRight)
  }

  return maxRowRight
}

function readMaxDescendantRight(
  rowsElement: Element,
  toLocalX: (value: number) => number,
): number | null {
  let maxDescendantRight: number | null = null
  for (const row of rowsElement.querySelectorAll(':scope > div')) {
    for (const child of row.querySelectorAll('*')) {
      const rect = child.getBoundingClientRect()
      if (!Number.isFinite(rect.right)) {
        continue
      }

      const localRight = toLocalX(rect.right)
      if (!Number.isFinite(localRight)) {
        continue
      }

      maxDescendantRight =
        maxDescendantRight === null ? localRight : Math.max(maxDescendantRight, localRight)
    }
  }

  return maxDescendantRight
}

function resolveDomRendererRectScaleX(screenElement: HTMLElement, screenRect: DOMRect): number {
  const screenWidth = screenElement.clientWidth
  if (
    Number.isFinite(screenWidth) &&
    screenWidth > 0 &&
    Number.isFinite(screenRect.width) &&
    screenRect.width > 0
  ) {
    return screenRect.width / screenWidth
  }

  return 1
}

function getDomRendererTextFootprint(container: HTMLElement): {
  contentWidth: number
  outerWidth: number
  screenToScrollbarGapPx: number | null
  textToScrollbarGapPx: number | null
  glyphToScrollbarGapPx: number | null
} | null {
  const xtermElement = container.querySelector('.xterm')
  const screenElement = container.querySelector('.xterm-screen')
  const rowsElement =
    screenElement?.querySelector('.xterm-rows') ?? container.querySelector('.xterm-rows')
  if (
    !(xtermElement instanceof HTMLElement) ||
    !(screenElement instanceof HTMLElement) ||
    !(rowsElement instanceof HTMLElement)
  ) {
    return null
  }

  const screenRect = screenElement.getBoundingClientRect()
  const rectScaleX = resolveDomRendererRectScaleX(screenElement, screenRect)
  const toLocalX = (value: number): number => (value - screenRect.left) / rectScaleX
  const screenRight = screenElement.clientWidth
  const scrollbarElement = container.querySelector('.xterm-scrollable-element .scrollbar.vertical')
  const scrollbarRect =
    scrollbarElement instanceof HTMLElement ? scrollbarElement.getBoundingClientRect() : null
  const scrollbarLeft =
    scrollbarRect &&
    Number.isFinite(scrollbarRect.left) &&
    Number.isFinite(scrollbarRect.width) &&
    Number.isFinite(scrollbarRect.height) &&
    scrollbarRect.width > 0 &&
    scrollbarRect.height > 0
      ? toLocalX(scrollbarRect.left)
      : null
  const screenToScrollbarGapPx =
    scrollbarLeft !== null && Number.isFinite(scrollbarLeft) ? scrollbarLeft - screenRight : null
  const maxRowRight = readMaxRowRight(rowsElement, toLocalX)
  const maxDescendantRight = readMaxDescendantRight(rowsElement, toLocalX)
  const maxVisibleTextRight =
    maxRowRight === null && maxDescendantRight === null
      ? null
      : Math.max(
          maxRowRight ?? Number.NEGATIVE_INFINITY,
          maxDescendantRight ?? Number.NEGATIVE_INFINITY,
        )
  const visualRight =
    maxVisibleTextRight === null ? screenRight : Math.max(screenRight, maxVisibleTextRight)
  const hasVisibleTextOverhang =
    maxVisibleTextRight !== null &&
    maxVisibleTextRight > screenRight + DOM_RENDERER_TEXT_OVERHANG_EPSILON_PX
  const hasDescendantOverhang =
    maxDescendantRight !== null &&
    maxRowRight !== null &&
    maxDescendantRight > maxRowRight + DOM_RENDERER_TEXT_OVERHANG_EPSILON_PX
  const textToScrollbarGapPx =
    scrollbarLeft === null || !hasVisibleTextOverhang ? null : scrollbarLeft - visualRight
  const glyphToScrollbarGapPx =
    scrollbarLeft === null || !hasDescendantOverhang ? null : scrollbarLeft - maxDescendantRight
  const visibleContentOverflowPx =
    maxVisibleTextRight === null ? 0 : Math.max(0, maxVisibleTextRight - screenRight)
  const contentWidth = screenRight + visibleContentOverflowPx
  const outerWidth = Math.min(container.clientWidth, xtermElement.clientWidth)
  if (
    !Number.isFinite(contentWidth) ||
    !Number.isFinite(outerWidth) ||
    contentWidth <= 0 ||
    outerWidth <= 0
  ) {
    return null
  }

  return {
    contentWidth,
    outerWidth,
    screenToScrollbarGapPx,
    textToScrollbarGapPx,
    glyphToScrollbarGapPx,
  }
}

function resolveDomRendererScrollbarGapSafeCols({
  baselineCols,
  measured,
  cellWidth,
  screenToScrollbarGapPx,
  safetyCells = DOM_RENDERER_SCROLLBAR_GAP_SAFETY_CELLS,
}: {
  baselineCols: number
  measured: PtySize
  cellWidth: number
  screenToScrollbarGapPx: number | null
  safetyCells?: number
}): number | null {
  if (screenToScrollbarGapPx === null || measured.cols <= 1) {
    return null
  }

  const targetGapPx = safetyCells * cellWidth
  const projectedGapPx = screenToScrollbarGapPx - (measured.cols - baselineCols) * cellWidth
  if (projectedGapPx + DOM_RENDERER_TEXT_OVERHANG_EPSILON_PX >= targetGapPx) {
    return null
  }

  const safeExtraCols = Math.floor(
    (screenToScrollbarGapPx - targetGapPx + DOM_RENDERER_TEXT_OVERHANG_EPSILON_PX) / cellWidth,
  )
  const safeCols = Math.min(measured.cols - 1, baselineCols + safeExtraCols)
  return safeCols > 0 && safeCols < measured.cols ? safeCols : null
}

function resolveDomRendererSafeMeasuredSize({
  terminal,
  container,
  measured,
  referenceCols,
}: {
  terminal: Terminal
  container: HTMLElement
  measured: PtySize
  referenceCols?: number
}): PtySize {
  if (container.dataset?.coveTerminalRenderer !== 'dom') {
    return measured
  }

  const cellWidth = readTerminalRenderDimensionsSafely(terminal)?.css?.cell?.width
  if (typeof cellWidth !== 'number' || !Number.isFinite(cellWidth) || cellWidth <= 0) {
    return measured
  }

  if (terminal.cols <= 0) {
    return measured
  }

  const baselineCols =
    typeof referenceCols === 'number' && Number.isFinite(referenceCols) && referenceCols > 0
      ? Math.floor(referenceCols)
      : terminal.cols
  const footprint = getDomRendererTextFootprint(container)
  if (!footprint) {
    return measured
  }

  let safeCols = measured.cols

  const expectedCurrentTextWidth = baselineCols * cellWidth
  const hasVisibleTextOverhang =
    footprint.contentWidth > expectedCurrentTextWidth + DOM_RENDERER_TEXT_OVERHANG_EPSILON_PX

  if (hasVisibleTextOverhang && footprint.screenToScrollbarGapPx === null) {
    const measuredCellFootprint = footprint.contentWidth / baselineCols
    const safeCellFootprint = Math.max(cellWidth, measuredCellFootprint)
    const measuredAvailableTextWidth = measured.cols * cellWidth
    const safeTextWidth = Math.min(footprint.outerWidth, measuredAvailableTextWidth)
    const overhangSafetyPx = DOM_RENDERER_TEXT_OVERHANG_SAFETY_CELLS * cellWidth
    const overhangSafeCols = Math.floor((safeTextWidth - overhangSafetyPx) / safeCellFootprint)
    if (Number.isFinite(overhangSafeCols) && overhangSafeCols > 0) {
      safeCols = Math.min(safeCols, overhangSafeCols)
    }
  }

  const scrollbarGapSafeCols = resolveDomRendererScrollbarGapSafeCols({
    baselineCols,
    measured,
    cellWidth,
    screenToScrollbarGapPx: footprint.screenToScrollbarGapPx,
  })
  if (scrollbarGapSafeCols !== null) {
    safeCols = Math.min(safeCols, scrollbarGapSafeCols)
  }

  const visibleTextScrollbarGapSafeCols = resolveDomRendererScrollbarGapSafeCols({
    baselineCols,
    measured,
    cellWidth,
    screenToScrollbarGapPx: footprint.textToScrollbarGapPx,
  })
  if (visibleTextScrollbarGapSafeCols !== null) {
    safeCols = Math.min(safeCols, visibleTextScrollbarGapSafeCols)
  }

  const glyphScrollbarGapSafeCols = resolveDomRendererScrollbarGapSafeCols({
    baselineCols,
    measured,
    cellWidth,
    screenToScrollbarGapPx: footprint.glyphToScrollbarGapPx,
    safetyCells: DOM_RENDERER_GLYPH_SCROLLBAR_GAP_SAFETY_CELLS,
  })
  if (glyphScrollbarGapSafeCols !== null) {
    safeCols = Math.min(safeCols, glyphScrollbarGapSafeCols)
  }

  if (!Number.isFinite(safeCols) || safeCols <= 0 || safeCols >= measured.cols) {
    return measured
  }

  return {
    cols: Math.max(1, safeCols),
    rows: measured.rows,
  }
}

function reconcileDomRendererTextOverhangLocally({
  terminalRef,
  fitAddonRef,
  containerRef,
  isPointerResizingRef,
  sessionId,
  lastCommittedPtySizeRef,
  lastOutputCorrection,
  suppressPtyResize,
  remainingFrames,
}: TerminalGeometryRefs & {
  sessionId: string
  lastOutputCorrection: PtySize | null
  suppressPtyResize: boolean
  remainingFrames: number
}): PtySize | null {
  const terminal = terminalRef.current
  const fitAddon = fitAddonRef.current
  const container = containerRef.current
  if (
    !canRefreshTerminalLayout({ terminal, container, isPointerResizingRef }) ||
    !terminal ||
    !fitAddon ||
    !container
  ) {
    logDomTextOverhangSchedulerDiagnostics({
      event: 'geometry-dom-overhang-scheduler-skipped',
      terminal,
      fitAddon,
      container,
      sessionId,
      lastCommittedPtySize: lastCommittedPtySizeRef.current,
      skippedReason: !terminal
        ? 'missing-terminal'
        : !fitAddon
          ? 'missing-fit-addon'
          : !container
            ? 'missing-container'
            : container.clientWidth <= 2 || container.clientHeight <= 2
              ? 'container-too-small'
              : isPointerResizingRef.current
                ? 'pointer-resizing'
                : 'unknown',
      remainingFrames,
      suppressPtyResize,
    })
    return null
  }

  if (suppressPtyResize) {
    logDomTextOverhangSchedulerDiagnostics({
      event: 'geometry-dom-overhang-scheduler-skipped',
      terminal,
      fitAddon,
      container,
      sessionId,
      lastCommittedPtySize: lastCommittedPtySizeRef.current,
      skippedReason: 'pty-resize-suppressed',
      remainingFrames,
      suppressPtyResize,
    })
    return null
  }

  const committedPtySize = lastCommittedPtySizeRef.current
  if (!committedPtySize) {
    logDomTextOverhangSchedulerDiagnostics({
      event: 'geometry-dom-overhang-scheduler-skipped',
      terminal,
      fitAddon,
      container,
      sessionId,
      lastCommittedPtySize: null,
      skippedReason: 'missing-committed-pty-size',
      remainingFrames,
      suppressPtyResize,
    })
    return null
  }

  const proposed = fitAddon.proposeDimensions()
  if (!proposed) {
    logDomTextOverhangSchedulerDiagnostics({
      event: 'geometry-dom-overhang-scheduler-skipped',
      terminal,
      fitAddon,
      container,
      sessionId,
      lastCommittedPtySize: committedPtySize,
      skippedReason: 'propose-dimensions-null',
      remainingFrames,
      suppressPtyResize,
    })
    return null
  }

  const measured = {
    cols: proposed.cols,
    rows: committedPtySize.rows,
  }
  const safeMeasured = resolveDomRendererSafeMeasuredSize({
    terminal,
    container,
    measured,
    referenceCols: committedPtySize.cols,
  })
  const safeMeasuredCols = Math.floor(safeMeasured.cols)
  const isCurrentOutputCorrection =
    lastOutputCorrection !== null &&
    committedPtySize.cols === lastOutputCorrection.cols &&
    committedPtySize.rows === lastOutputCorrection.rows
  const canRecoverFromOutputCorrection =
    isCurrentOutputCorrection &&
    safeMeasuredCols > committedPtySize.cols &&
    safeMeasuredCols < measured.cols
  if (isCurrentOutputCorrection && !canRecoverFromOutputCorrection) {
    logDomTextOverhangSchedulerDiagnostics({
      event: 'geometry-dom-overhang-scheduler-skipped',
      terminal,
      fitAddon,
      container,
      sessionId,
      lastCommittedPtySize: committedPtySize,
      skippedReason: 'output-correction-already-applied',
      remainingFrames,
      suppressPtyResize,
    })
    return null
  }

  if (
    !Number.isFinite(safeMeasuredCols) ||
    safeMeasuredCols <= 0 ||
    safeMeasuredCols >= measured.cols ||
    (!canRecoverFromOutputCorrection && safeMeasuredCols >= committedPtySize.cols)
  ) {
    logDomTextOverhangSchedulerDiagnostics({
      event: 'geometry-dom-overhang-scheduler-skipped',
      terminal,
      fitAddon,
      container,
      sessionId,
      lastCommittedPtySize: committedPtySize,
      skippedReason: 'no-output-safe-column-shrink',
      remainingFrames,
      suppressPtyResize,
    })
    return null
  }

  const nextPtySize = {
    cols: safeMeasuredCols,
    rows: committedPtySize.rows,
  }
  resizeTerminalPreservingScrollState(terminal, nextPtySize.cols, nextPtySize.rows)
  lastCommittedPtySizeRef.current = nextPtySize
  refreshTerminalNodeSize({
    terminalRef,
    containerRef,
    isPointerResizingRef,
  })
  logDomTextOverhangSchedulerDiagnostics({
    event: 'geometry-dom-overhang-commit-resize',
    terminal,
    fitAddon,
    container,
    sessionId,
    lastCommittedPtySize: nextPtySize,
    remainingFrames,
    suppressPtyResize,
  })
  void window.opencoveApi.pty.resize({
    sessionId,
    cols: nextPtySize.cols,
    rows: nextPtySize.rows,
    reason: 'appearance_commit',
  })
  return nextPtySize
}

async function resolveStableMeasuredTerminalNodeGeometry({
  terminalRef,
  fitAddonRef,
  containerRef,
  isPointerResizingRef,
}: {
  terminalRef: MutableRefObject<Terminal | null>
  fitAddonRef: MutableRefObject<FitAddon | null>
  containerRef: MutableRefObject<HTMLElement | null>
  isPointerResizingRef: MutableRefObject<boolean>
}): Promise<PtySize | null> {
  const attemptResolve = async (
    attempt: number,
    previousSample: StableMeasuredGeometrySample | null,
    lastResolvedSize: PtySize | null,
    stableSamples: number,
  ): Promise<PtySize | null> => {
    if (attempt >= STABLE_MEASURED_GEOMETRY_MAX_ATTEMPTS) {
      return lastResolvedSize
    }

    await waitForAnimationFrame()

    const terminal = terminalRef.current
    const fitAddon = fitAddonRef.current
    const container = containerRef.current
    if (
      !canRefreshTerminalLayout({ terminal, container, isPointerResizingRef }) ||
      !terminal ||
      !fitAddon ||
      !container
    ) {
      return attemptResolve(attempt + 1, previousSample, lastResolvedSize, stableSamples)
    }

    const proposed = fitAddon.proposeDimensions()
    if (!proposed) {
      return attemptResolve(attempt + 1, previousSample, lastResolvedSize, stableSamples)
    }

    const nextPtySize = resolveDomRendererSafeMeasuredSize({
      terminal,
      container,
      measured: proposed,
    })
    applyTerminalNodeGeometryLocally({
      terminalRef,
      containerRef,
      isPointerResizingRef,
      size: nextPtySize,
    })
    const nextSample = createStableMeasuredGeometrySample({
      terminal,
      container,
      measured: nextPtySize,
    })
    const nextStableSamples = isSameStableMeasuredGeometrySample(previousSample, nextSample)
      ? stableSamples + 1
      : 1
    const canCommitStableGeometry =
      nextStableSamples >= 2 && attempt + 1 >= STABLE_MEASURED_GEOMETRY_MIN_SAMPLES

    if (canCommitStableGeometry) {
      return nextPtySize
    }

    return attemptResolve(attempt + 1, nextSample, nextPtySize, nextStableSamples)
  }

  return attemptResolve(0, null, null, 0)
}

export function refreshTerminalNodeSize({
  terminalRef,
  containerRef,
  isPointerResizingRef,
}: {
  terminalRef: MutableRefObject<Terminal | null>
  containerRef: MutableRefObject<HTMLElement | null>
  isPointerResizingRef: MutableRefObject<boolean>
}): void {
  const terminal = terminalRef.current
  const container = containerRef.current

  if (!canRefreshTerminalLayout({ terminal, container, isPointerResizingRef })) {
    logTerminalGeometryDiagnostics({
      event: 'geometry-refresh-skipped',
      terminal,
      fitAddon: null,
      container,
      sessionId: null,
      skippedReason: !terminal
        ? 'missing-terminal'
        : !container
          ? 'missing-container'
          : container.clientWidth <= 2 || container.clientHeight <= 2
            ? 'container-too-small'
            : isPointerResizingRef.current
              ? 'pointer-resizing'
              : 'unknown',
    })
    return
  }

  if (!terminal) {
    return
  }

  if (terminal.cols <= 0 || terminal.rows <= 0) {
    return
  }

  syncDomRendererDimensionsToCurrentGeometry({ terminal, container })
  clampXtermHeightToExactRows(terminal)
  runTerminalRenderMutationSafely(() => {
    terminal.refresh(0, Math.max(0, terminal.rows - 1))
  })
  logTerminalGeometryDiagnostics({
    event: 'geometry-refresh',
    terminal,
    fitAddon: null,
    container,
    sessionId: null,
  })
}

export function commitTerminalNodeGeometry({
  terminalRef,
  fitAddonRef,
  containerRef,
  isPointerResizingRef,
  lastCommittedPtySizeRef,
  sessionId,
  reason,
  options,
}: {
  terminalRef: MutableRefObject<Terminal | null>
  fitAddonRef: MutableRefObject<FitAddon | null>
  containerRef: MutableRefObject<HTMLElement | null>
  isPointerResizingRef: MutableRefObject<boolean>
  lastCommittedPtySizeRef: MutableRefObject<{ cols: number; rows: number } | null>
  sessionId: string
  reason: TerminalGeometryCommitReason
  options?: FitTerminalNodeOptions
}): void {
  const nextPtySize = fitTerminalNodeToMeasuredSize({
    terminalRef,
    fitAddonRef,
    containerRef,
    isPointerResizingRef,
    lastCommittedPtySizeRef,
    options,
  })

  if (!nextPtySize) {
    if (options?.logWhenStable !== false) {
      logTerminalGeometryDiagnostics({
        event: 'geometry-commit-skipped',
        terminal: terminalRef.current,
        fitAddon: fitAddonRef.current,
        container: containerRef.current,
        sessionId,
        reason,
        lastCommittedPtySize: lastCommittedPtySizeRef.current,
        skippedReason: 'no-next-size',
      })
    }
    return
  }

  logTerminalGeometryDiagnostics({
    event: 'geometry-commit-resize',
    terminal: terminalRef.current,
    fitAddon: fitAddonRef.current,
    container: containerRef.current,
    sessionId,
    reason,
    lastCommittedPtySize: lastCommittedPtySizeRef.current,
    nextPtySize,
  })
  void window.opencoveApi.pty.resize({
    sessionId,
    cols: nextPtySize.cols,
    rows: nextPtySize.rows,
    reason,
  })
}

export function createTerminalDomTextOverhangGeometryCommitScheduler({
  terminalRef,
  fitAddonRef,
  containerRef,
  isPointerResizingRef,
  lastCommittedPtySizeRef,
  suppressPtyResizeRef,
  sessionId,
}: TerminalGeometryRefs & {
  suppressPtyResizeRef: MutableRefObject<boolean>
  sessionId: string
}): { schedule: () => void; dispose: () => void } {
  let frameId: number | null = null
  let disposed = false
  let remainingFrames = 0
  let lastOutputCorrection: PtySize | null = null

  const run = (): void => {
    frameId = null
    if (disposed || sessionId.trim().length === 0) {
      logDomTextOverhangSchedulerDiagnostics({
        event: 'geometry-dom-overhang-scheduler-skipped',
        terminal: terminalRef.current,
        fitAddon: fitAddonRef.current,
        container: containerRef.current,
        sessionId,
        lastCommittedPtySize: lastCommittedPtySizeRef.current,
        skippedReason: disposed ? 'disposed' : 'empty-session-id',
        remainingFrames,
        suppressPtyResize: suppressPtyResizeRef.current,
      })
      return
    }

    const container = containerRef.current
    if (container?.dataset?.coveTerminalRenderer !== 'dom') {
      logDomTextOverhangSchedulerDiagnostics({
        event: 'geometry-dom-overhang-scheduler-skipped',
        terminal: terminalRef.current,
        fitAddon: fitAddonRef.current,
        container,
        sessionId,
        lastCommittedPtySize: lastCommittedPtySizeRef.current,
        skippedReason: 'non-dom-renderer',
        remainingFrames,
        suppressPtyResize: suppressPtyResizeRef.current,
      })
      return
    }

    if (remainingFrames > 0) {
      remainingFrames -= 1
      frameId = window.requestAnimationFrame(run)
      return
    }

    const appliedCorrection = reconcileDomRendererTextOverhangLocally({
      terminalRef,
      fitAddonRef,
      containerRef,
      isPointerResizingRef,
      sessionId,
      lastCommittedPtySizeRef,
      lastOutputCorrection,
      suppressPtyResize: suppressPtyResizeRef.current,
      remainingFrames,
    })
    if (appliedCorrection) {
      lastOutputCorrection = appliedCorrection
    }
  }

  return {
    schedule: () => {
      if (disposed) {
        return
      }

      remainingFrames = 2
      if (frameId === null) {
        frameId = window.requestAnimationFrame(run)
      }
    },
    dispose: () => {
      disposed = true
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId)
        frameId = null
      }
    },
  }
}

export function fitTerminalNodeToMeasuredSize({
  terminalRef,
  fitAddonRef,
  containerRef,
  isPointerResizingRef,
  lastCommittedPtySizeRef,
  options,
}: {
  terminalRef: MutableRefObject<Terminal | null>
  fitAddonRef: MutableRefObject<FitAddon | null>
  containerRef: MutableRefObject<HTMLElement | null>
  isPointerResizingRef: MutableRefObject<boolean>
  lastCommittedPtySizeRef?: MutableRefObject<{ cols: number; rows: number } | null>
  options?: FitTerminalNodeOptions
}): { cols: number; rows: number } | null {
  const terminal = terminalRef.current
  const fitAddon = fitAddonRef.current
  const container = containerRef.current

  if (!terminal || !fitAddon) {
    logTerminalGeometryDiagnostics({
      event: 'geometry-fit-skipped',
      terminal,
      fitAddon,
      container,
      sessionId: null,
      lastCommittedPtySize: lastCommittedPtySizeRef?.current ?? null,
      skippedReason: !terminal ? 'missing-terminal' : 'missing-fit-addon',
    })
    return null
  }

  if (!canRefreshTerminalLayout({ terminal, container, isPointerResizingRef }) || !container) {
    logTerminalGeometryDiagnostics({
      event: 'geometry-fit-skipped',
      terminal,
      fitAddon,
      container,
      sessionId: null,
      lastCommittedPtySize: lastCommittedPtySizeRef?.current ?? null,
      skippedReason: !container
        ? 'missing-container'
        : container.clientWidth <= 2 || container.clientHeight <= 2
          ? 'container-too-small'
          : isPointerResizingRef.current
            ? 'pointer-resizing'
            : 'unknown',
    })
    return null
  }

  const proposed = fitAddon.proposeDimensions()
  if (!proposed) {
    logTerminalGeometryDiagnostics({
      event: 'geometry-fit-no-measurement',
      terminal,
      fitAddon,
      container,
      sessionId: null,
      lastCommittedPtySize: lastCommittedPtySizeRef?.current ?? null,
      skippedReason: 'propose-dimensions-null',
    })
    return null
  }
  const measured = resolveDomRendererSafeMeasuredSize({
    terminal,
    container,
    measured: proposed,
  })

  const nextPtySize = resolveStablePtySize({
    previous: lastCommittedPtySizeRef?.current ?? null,
    measured,
    preventRowShrink: false,
  })

  if (!nextPtySize) {
    const committedPtySize = lastCommittedPtySizeRef?.current ?? null
    const shouldRestoreLocalGeometry =
      committedPtySize !== null &&
      committedPtySize.cols === measured.cols &&
      committedPtySize.rows === measured.rows &&
      (terminal.cols !== measured.cols || terminal.rows !== measured.rows)
    if (shouldRestoreLocalGeometry) {
      resizeTerminalPreservingScrollState(terminal, measured.cols, measured.rows)
      refreshTerminalNodeSize({
        terminalRef,
        containerRef,
        isPointerResizingRef,
      })
      logTerminalGeometryDiagnostics({
        event: 'geometry-fit-local-restore',
        terminal,
        fitAddon,
        container,
        sessionId: null,
        lastCommittedPtySize: committedPtySize,
        measured,
      })
      return null
    }

    if (options?.logWhenStable !== false) {
      logTerminalGeometryDiagnostics({
        event: 'geometry-fit-no-stable-size',
        terminal,
        fitAddon,
        container,
        sessionId: null,
        lastCommittedPtySize: lastCommittedPtySizeRef?.current ?? null,
        measured,
        skippedReason: 'resolve-stable-size-null',
      })
    }
    if (options?.refreshWhenStable !== false) {
      refreshTerminalNodeSize({
        terminalRef,
        containerRef,
        isPointerResizingRef,
      })
    }
    return null
  }

  if (terminal.cols !== nextPtySize.cols || terminal.rows !== nextPtySize.rows) {
    resizeTerminalPreservingScrollState(terminal, nextPtySize.cols, nextPtySize.rows)
  }

  if (lastCommittedPtySizeRef) {
    lastCommittedPtySizeRef.current = nextPtySize
  }
  refreshTerminalNodeSize({
    terminalRef,
    containerRef,
    isPointerResizingRef,
  })
  logTerminalGeometryDiagnostics({
    event: 'geometry-fit-applied',
    terminal,
    fitAddon,
    container,
    sessionId: null,
    lastCommittedPtySize: lastCommittedPtySizeRef?.current ?? null,
    measured,
    nextPtySize,
  })

  return nextPtySize
}

async function commitMeasuredTerminalNodeGeometry({
  terminalRef,
  fitAddonRef,
  containerRef,
  isPointerResizingRef,
  lastCommittedPtySizeRef,
  sessionId,
  reason,
  nextPtySize,
  commitEvent,
  skippedEvent,
  unchangedEvent,
  shouldCommit,
}: {
  terminalRef: MutableRefObject<Terminal | null>
  fitAddonRef: MutableRefObject<FitAddon | null>
  containerRef: MutableRefObject<HTMLElement | null>
  isPointerResizingRef: MutableRefObject<boolean>
  lastCommittedPtySizeRef: MutableRefObject<PtySize | null>
  sessionId: string
  reason: TerminalGeometryCommitReason
  nextPtySize: PtySize | null
  commitEvent: string
  skippedEvent: string
  unchangedEvent: string
  shouldCommit?: () => boolean
}): Promise<InitialTerminalNodeGeometryCommitResult | null> {
  if (!nextPtySize) {
    logTerminalGeometryDiagnostics({
      event: skippedEvent,
      terminal: terminalRef.current,
      fitAddon: fitAddonRef.current,
      container: containerRef.current,
      sessionId,
      reason,
      lastCommittedPtySize: lastCommittedPtySizeRef.current,
      skippedReason: 'no-next-size',
    })
    return null
  }

  if (shouldCommit && !shouldCommit()) {
    logTerminalGeometryDiagnostics({
      event: skippedEvent,
      terminal: terminalRef.current,
      fitAddon: fitAddonRef.current,
      container: containerRef.current,
      sessionId,
      reason,
      lastCommittedPtySize: lastCommittedPtySizeRef.current,
      nextPtySize,
      skippedReason: 'stale-session',
    })
    return null
  }

  applyTerminalNodeGeometryLocally({
    terminalRef,
    containerRef,
    isPointerResizingRef,
    size: nextPtySize,
  })

  const alreadyCommitted =
    lastCommittedPtySizeRef.current?.cols === nextPtySize.cols &&
    lastCommittedPtySizeRef.current.rows === nextPtySize.rows

  if (alreadyCommitted) {
    logTerminalGeometryDiagnostics({
      event: unchangedEvent,
      terminal: terminalRef.current,
      fitAddon: fitAddonRef.current,
      container: containerRef.current,
      sessionId,
      reason,
      lastCommittedPtySize: lastCommittedPtySizeRef.current,
      nextPtySize,
    })
    return { ...nextPtySize, changed: false }
  }

  await window.opencoveApi.pty.resize({
    sessionId,
    cols: nextPtySize.cols,
    rows: nextPtySize.rows,
    reason,
  })

  lastCommittedPtySizeRef.current = nextPtySize
  logTerminalGeometryDiagnostics({
    event: commitEvent,
    terminal: terminalRef.current,
    fitAddon: fitAddonRef.current,
    container: containerRef.current,
    sessionId,
    reason,
    lastCommittedPtySize: lastCommittedPtySizeRef.current,
    nextPtySize,
  })
  return { ...nextPtySize, changed: true }
}

function applyTerminalNodeGeometryLocally({
  terminalRef,
  containerRef,
  isPointerResizingRef,
  size,
}: {
  terminalRef: MutableRefObject<Terminal | null>
  containerRef: MutableRefObject<HTMLElement | null>
  isPointerResizingRef: MutableRefObject<boolean>
  size: PtySize
}): void {
  const terminal = terminalRef.current
  if (!terminal) {
    return
  }

  if (terminal.cols !== size.cols || terminal.rows !== size.rows) {
    resizeTerminalPreservingScrollState(terminal, size.cols, size.rows)
  }

  refreshTerminalNodeSize({
    terminalRef,
    containerRef,
    isPointerResizingRef,
  })
}

export async function commitSettledTerminalNodeGeometry({
  terminalRef,
  fitAddonRef,
  containerRef,
  isPointerResizingRef,
  lastCommittedPtySizeRef,
  sessionId,
  reason,
  shouldCommit,
}: {
  terminalRef: MutableRefObject<Terminal | null>
  fitAddonRef: MutableRefObject<FitAddon | null>
  containerRef: MutableRefObject<HTMLElement | null>
  isPointerResizingRef: MutableRefObject<boolean>
  lastCommittedPtySizeRef: MutableRefObject<PtySize | null>
  sessionId: string
  reason: TerminalGeometryCommitReason
  shouldCommit?: () => boolean
}): Promise<InitialTerminalNodeGeometryCommitResult | null> {
  const nextPtySize = await resolveStableMeasuredTerminalNodeGeometry({
    terminalRef,
    fitAddonRef,
    containerRef,
    isPointerResizingRef,
  })

  return await commitMeasuredTerminalNodeGeometry({
    terminalRef,
    fitAddonRef,
    containerRef,
    isPointerResizingRef,
    lastCommittedPtySizeRef,
    sessionId,
    reason,
    nextPtySize,
    commitEvent: 'geometry-settled-commit-resized',
    skippedEvent: 'geometry-settled-commit-skipped',
    unchangedEvent: 'geometry-settled-commit-unchanged',
    shouldCommit,
  })
}

export async function commitInitialTerminalNodeGeometry({
  terminalRef,
  fitAddonRef,
  containerRef,
  isPointerResizingRef,
  lastCommittedPtySizeRef,
  sessionId,
  reason,
}: {
  terminalRef: MutableRefObject<Terminal | null>
  fitAddonRef: MutableRefObject<FitAddon | null>
  containerRef: MutableRefObject<HTMLElement | null>
  isPointerResizingRef: MutableRefObject<boolean>
  lastCommittedPtySizeRef: MutableRefObject<{ cols: number; rows: number } | null>
  sessionId: string
  reason: TerminalGeometryCommitReason
}): Promise<InitialTerminalNodeGeometryCommitResult | null> {
  const nextPtySize = await resolveStableMeasuredTerminalNodeGeometry({
    terminalRef,
    fitAddonRef,
    containerRef,
    isPointerResizingRef,
  })

  return await commitMeasuredTerminalNodeGeometry({
    terminalRef,
    fitAddonRef,
    containerRef,
    isPointerResizingRef,
    lastCommittedPtySizeRef,
    sessionId,
    reason,
    nextPtySize,
    commitEvent: 'geometry-initial-commit-resized',
    skippedEvent: 'geometry-initial-commit-skipped',
    unchangedEvent: 'geometry-initial-commit-unchanged',
  })
}
