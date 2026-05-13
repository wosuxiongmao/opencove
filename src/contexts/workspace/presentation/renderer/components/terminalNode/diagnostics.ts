import type {
  TerminalDiagnosticsBufferKind,
  TerminalDiagnosticsDetailValue,
  TerminalDiagnosticsLogInput,
  TerminalDiagnosticsSnapshot,
} from '@shared/contracts/dto'
import type { Terminal } from '@xterm/xterm'
import { readTerminalRenderDimensionsSafely } from './renderServiceSafety'

interface TerminalBufferStateLike {
  baseY?: number
  viewportY?: number
  length?: number
}

interface TerminalBufferNamespaceLike {
  active?: TerminalBufferStateLike
  normal?: TerminalBufferStateLike
  alternate?: TerminalBufferStateLike
}

interface TerminalForDiagnosticsLike {
  cols: number
  rows: number
  buffer?: TerminalBufferNamespaceLike
  options?: {
    fontSize?: number
    lineHeight?: number
    letterSpacing?: number
    fontFamily?: string
  }
  element?: HTMLElement | null
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toNonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function safeMatches(element: Element | null, selector: string): boolean {
  if (!(element instanceof Element)) {
    return false
  }

  try {
    return element.matches(selector)
  } catch {
    return false
  }
}

function getComputedCursor(element: Element | null): string | null {
  if (!(element instanceof Element)) {
    return null
  }

  return toNonEmptyString(window.getComputedStyle(element).cursor)
}

function getComputedBorderColor(element: Element | null): string | null {
  if (!(element instanceof Element)) {
    return null
  }

  return toNonEmptyString(window.getComputedStyle(element).borderColor)
}

function getComputedStyleValue(element: Element | null, propertyName: string): string | null {
  if (!(element instanceof Element)) {
    return null
  }

  return toNonEmptyString(window.getComputedStyle(element).getPropertyValue(propertyName))
}

function getComputedPixelValue(element: Element | null, propertyName: string): number | null {
  if (!(element instanceof Element)) {
    return null
  }

  const value = Number.parseFloat(window.getComputedStyle(element).getPropertyValue(propertyName))
  return Number.isFinite(value) ? value : null
}

function getElementRectMetrics(
  element: Element | null,
  prefix: string,
): Record<string, TerminalDiagnosticsDetailValue> {
  if (!(element instanceof Element)) {
    return {
      [`${prefix}RectLeft`]: null,
      [`${prefix}RectRight`]: null,
      [`${prefix}RectWidth`]: null,
      [`${prefix}RectHeight`]: null,
      [`${prefix}ClientWidth`]: null,
      [`${prefix}ClientHeight`]: null,
      [`${prefix}ScrollWidth`]: null,
      [`${prefix}ScrollHeight`]: null,
    }
  }

  const rect = element.getBoundingClientRect()
  const htmlElement = element instanceof HTMLElement ? element : null
  return {
    [`${prefix}RectLeft`]: toFiniteNumber(rect.left),
    [`${prefix}RectRight`]: toFiniteNumber(rect.right),
    [`${prefix}RectWidth`]: toFiniteNumber(rect.width),
    [`${prefix}RectHeight`]: toFiniteNumber(rect.height),
    [`${prefix}ClientWidth`]: toFiniteNumber(htmlElement?.clientWidth),
    [`${prefix}ClientHeight`]: toFiniteNumber(htmlElement?.clientHeight),
    [`${prefix}ScrollWidth`]: toFiniteNumber(htmlElement?.scrollWidth),
    [`${prefix}ScrollHeight`]: toFiniteNumber(htmlElement?.scrollHeight),
  }
}

function getMaxChildRectMetric(
  parent: Element | null,
  selector: string,
  metric: 'left' | 'right' | 'width',
): number | null {
  if (!(parent instanceof Element)) {
    return null
  }

  let resolved: number | null = null
  for (const child of parent.querySelectorAll(selector)) {
    const rect = child.getBoundingClientRect()
    const value = rect[metric]
    if (!Number.isFinite(value)) {
      continue
    }

    if (resolved === null) {
      resolved = value
      continue
    }

    resolved = metric === 'left' ? Math.min(resolved, value) : Math.max(resolved, value)
  }

  return resolved === null ? null : Math.round(resolved * 100) / 100
}

function getMaxChildLocalRightMetric(
  parent: Element | null,
  selector: string,
  toLocalX: ((value: number) => number) | null,
): number | null {
  if (!(parent instanceof Element) || !toLocalX) {
    return null
  }

  let resolved: number | null = null
  for (const child of parent.querySelectorAll(selector)) {
    const rect = child.getBoundingClientRect()
    if (!Number.isFinite(rect.right)) {
      continue
    }

    const value = toLocalX(rect.right)
    if (!Number.isFinite(value)) {
      continue
    }

    resolved = resolved === null ? value : Math.max(resolved, value)
  }

  return resolved === null ? null : Math.round(resolved * 100) / 100
}

function getFirstChildElement(parent: Element | null, selector: string): HTMLElement | null {
  const element = parent?.querySelector(selector)
  return element instanceof HTMLElement ? element : null
}

export function captureTerminalLayoutDiagnostics({
  terminal,
  container,
  proposedCols,
}: {
  terminal: TerminalForDiagnosticsLike
  container: HTMLElement | null
  proposedCols?: number | null
}): Record<string, TerminalDiagnosticsDetailValue> {
  const xtermElement =
    container?.querySelector('.xterm') instanceof HTMLElement
      ? (container.querySelector('.xterm') as HTMLElement)
      : null
  const viewportElement =
    container?.querySelector('.xterm-viewport') instanceof HTMLElement
      ? (container.querySelector('.xterm-viewport') as HTMLElement)
      : null
  const screenElement =
    container?.querySelector('.xterm-screen') instanceof HTMLElement
      ? (container.querySelector('.xterm-screen') as HTMLElement)
      : null
  const rowsElement =
    screenElement?.querySelector('.xterm-rows') instanceof HTMLElement
      ? (screenElement.querySelector('.xterm-rows') as HTMLElement)
      : null
  const firstRowElement = getFirstChildElement(rowsElement, ':scope > div')
  const firstRowSpanElement = getFirstChildElement(firstRowElement, 'span')
  const overviewRulerElement =
    container?.querySelector('.xterm-decoration-overview-ruler') instanceof HTMLElement
      ? (container.querySelector('.xterm-decoration-overview-ruler') as HTMLElement)
      : null
  const scrollbarElement =
    container?.querySelector('.xterm-scrollable-element .scrollbar.vertical') instanceof HTMLElement
      ? (container.querySelector('.xterm-scrollable-element .scrollbar.vertical') as HTMLElement)
      : null
  const scrollbarSliderElement =
    scrollbarElement?.querySelector('.slider') instanceof HTMLElement
      ? (scrollbarElement.querySelector('.slider') as HTMLElement)
      : null
  const canvasElement =
    screenElement?.querySelector('canvas') instanceof HTMLCanvasElement
      ? (screenElement.querySelector('canvas') as HTMLCanvasElement)
      : null
  const renderDimensions =
    terminal && 'element' in terminal
      ? readTerminalRenderDimensionsSafely(terminal as Terminal)
      : null
  const cssCellWidth = toFiniteNumber(renderDimensions?.css?.cell?.width)
  const cssCellHeight = toFiniteNumber(renderDimensions?.css?.cell?.height)
  const cssCanvasWidth = toFiniteNumber(renderDimensions?.css?.canvas?.width)
  const cssCanvasHeight = toFiniteNumber(renderDimensions?.css?.canvas?.height)
  const deviceCanvasWidth = toFiniteNumber(renderDimensions?.device?.canvas?.width)
  const deviceCanvasHeight = toFiniteNumber(renderDimensions?.device?.canvas?.height)
  const expectedTextWidth =
    cssCellWidth === null ? null : Math.round(terminal.cols * cssCellWidth * 100) / 100
  const expectedTextHeight =
    cssCellHeight === null ? null : Math.round(terminal.rows * cssCellHeight * 100) / 100
  const screenRect = screenElement?.getBoundingClientRect()
  const rowsRect = rowsElement?.getBoundingClientRect()
  const screenRectScaleX =
    screenElement &&
    screenRect &&
    screenElement.clientWidth > 0 &&
    Number.isFinite(screenRect.width) &&
    screenRect.width > 0
      ? screenRect.width / screenElement.clientWidth
      : null
  const toScreenLocalX =
    screenRect && screenRectScaleX !== null && screenRectScaleX > 0
      ? (value: number): number => (value - screenRect.left) / screenRectScaleX
      : null
  const screenRightLocal =
    screenElement && screenRectScaleX !== null ? screenElement.clientWidth : null
  const overflowX =
    screenRect && expectedTextWidth !== null
      ? Math.round((expectedTextWidth - screenRect.width) * 100) / 100
      : null
  const visibleWidthGap =
    container && screenRect
      ? Math.round((container.getBoundingClientRect().width - screenRect.width) * 100) / 100
      : null
  const screenRowsOverflowX =
    screenRect && rowsRect ? Math.round((rowsRect.width - screenRect.width) * 100) / 100 : null
  const xtermPaddingLeft = getComputedPixelValue(xtermElement, 'padding-left')
  const xtermPaddingRight = getComputedPixelValue(xtermElement, 'padding-right')
  const xtermHorizontalPadding =
    xtermPaddingLeft !== null && xtermPaddingRight !== null
      ? Math.round((xtermPaddingLeft + xtermPaddingRight) * 100) / 100
      : null
  const xtermLayoutGutterPx =
    xtermElement && screenElement && xtermHorizontalPadding !== null
      ? Math.round(
          (xtermElement.clientWidth - xtermHorizontalPadding - screenElement.clientWidth) * 100,
        ) / 100
      : null
  const terminalRightGutterPx =
    container && screenRect
      ? Math.round((container.getBoundingClientRect().right - screenRect.right) * 100) / 100
      : null
  const scrollbarRect = scrollbarElement?.getBoundingClientRect()
  const screenToScrollbarGapPx =
    screenRect &&
    scrollbarRect &&
    Number.isFinite(scrollbarRect.left) &&
    Number.isFinite(scrollbarRect.width) &&
    Number.isFinite(scrollbarRect.height) &&
    scrollbarRect.width > 0 &&
    scrollbarRect.height > 0
      ? Math.round((scrollbarRect.left - screenRect.right) * 100) / 100
      : null
  const scrollbarLeftLocal =
    scrollbarRect &&
    toScreenLocalX &&
    Number.isFinite(scrollbarRect.left) &&
    Number.isFinite(scrollbarRect.width) &&
    Number.isFinite(scrollbarRect.height) &&
    scrollbarRect.width > 0 &&
    scrollbarRect.height > 0
      ? Math.round(toScreenLocalX(scrollbarRect.left) * 100) / 100
      : null
  const screenToScrollbarGapLocalPx =
    scrollbarLeftLocal !== null && screenRightLocal !== null
      ? Math.round((scrollbarLeftLocal - screenRightLocal) * 100) / 100
      : null
  const domScrollbarGapSafetyTargetPx =
    cssCellWidth === null ? null : Math.round(cssCellWidth * 100) / 100
  const maxRowRight = getMaxChildRectMetric(rowsElement, ':scope > div', 'right')
  const maxRowWidth = getMaxChildRectMetric(rowsElement, ':scope > div', 'width')
  const maxSpanRight = getMaxChildRectMetric(rowsElement, ':scope > div span', 'right')
  const maxSpanWidth = getMaxChildRectMetric(rowsElement, ':scope > div span', 'width')
  const maxRowRightLocal = getMaxChildLocalRightMetric(rowsElement, ':scope > div', toScreenLocalX)
  const maxSpanRightLocal = getMaxChildLocalRightMetric(
    rowsElement,
    ':scope > div span',
    toScreenLocalX,
  )
  const maxVisibleTextRight =
    maxRowRight === null && maxSpanRight === null
      ? null
      : Math.max(maxRowRight ?? Number.NEGATIVE_INFINITY, maxSpanRight ?? Number.NEGATIVE_INFINITY)
  const maxVisibleTextRightLocal =
    maxRowRightLocal === null && maxSpanRightLocal === null
      ? null
      : Math.max(
          maxRowRightLocal ?? Number.NEGATIVE_INFINITY,
          maxSpanRightLocal ?? Number.NEGATIVE_INFINITY,
        )
  const rowContentOverflowRightPx =
    screenRect && maxRowRight !== null
      ? Math.round((maxRowRight - screenRect.right) * 100) / 100
      : null
  const spanContentOverflowRightPx =
    screenRect && maxSpanRight !== null
      ? Math.round((maxSpanRight - screenRect.right) * 100) / 100
      : null
  const visibleTextOverflowRightPx =
    screenRect && maxVisibleTextRight !== null
      ? Math.round((maxVisibleTextRight - screenRect.right) * 100) / 100
      : null
  const textToScrollbarGapPx =
    scrollbarRect &&
    maxVisibleTextRight !== null &&
    Number.isFinite(scrollbarRect.left) &&
    Number.isFinite(scrollbarRect.width) &&
    Number.isFinite(scrollbarRect.height) &&
    scrollbarRect.width > 0 &&
    scrollbarRect.height > 0
      ? Math.round((scrollbarRect.left - maxVisibleTextRight) * 100) / 100
      : null
  const rowContentOverflowRightLocalPx =
    screenRightLocal !== null && maxRowRightLocal !== null
      ? Math.round((maxRowRightLocal - screenRightLocal) * 100) / 100
      : null
  const spanContentOverflowRightLocalPx =
    screenRightLocal !== null && maxSpanRightLocal !== null
      ? Math.round((maxSpanRightLocal - screenRightLocal) * 100) / 100
      : null
  const visibleTextOverflowRightLocalPx =
    screenRightLocal !== null && maxVisibleTextRightLocal !== null
      ? Math.round((maxVisibleTextRightLocal - screenRightLocal) * 100) / 100
      : null
  const textToScrollbarGapLocalPx =
    scrollbarLeftLocal !== null && maxVisibleTextRightLocal !== null
      ? Math.round((scrollbarLeftLocal - maxVisibleTextRightLocal) * 100) / 100
      : null
  const visibleRowContentOverflowRightPx =
    rowContentOverflowRightPx === null ? null : Math.max(0, rowContentOverflowRightPx)
  const domContentOverflowBeyondXtermPx =
    rowsElement && xtermElement
      ? Math.round((rowsElement.scrollWidth - xtermElement.clientWidth) * 100) / 100
      : null
  const domContentOverflowBeyondContainerPx =
    rowsElement && container
      ? Math.round((rowsElement.scrollWidth - container.clientWidth) * 100) / 100
      : null
  const measuredRowCellFootprint =
    rowsElement && terminal.cols > 0 && rowsElement.scrollWidth > 0
      ? rowsElement.scrollWidth / terminal.cols
      : null
  const hasDomRowTextOverhang =
    cssCellWidth !== null &&
    rowsElement &&
    measuredRowCellFootprint !== null &&
    rowsElement.scrollWidth > terminal.cols * cssCellWidth + 0.5
  const domSafeColsInputCols =
    typeof proposedCols === 'number' && Number.isFinite(proposedCols) && proposedCols > 0
      ? proposedCols
      : null
  const domSafeTextWidth =
    cssCellWidth !== null && domSafeColsInputCols !== null && container && xtermElement
      ? Math.min(
          Math.min(container.clientWidth, xtermElement.clientWidth),
          domSafeColsInputCols * cssCellWidth,
        )
      : null
  const domSafeColsByRowsScrollWidth =
    cssCellWidth !== null &&
    rowsElement &&
    hasDomRowTextOverhang &&
    rowsElement.scrollWidth > 0 &&
    screenElement &&
    terminal.cols > 0 &&
    domSafeTextWidth !== null
      ? Math.floor(
          (domSafeTextWidth - cssCellWidth) /
            Math.max(
              cssCellWidth,
              (screenElement.clientWidth + (visibleRowContentOverflowRightPx ?? 0)) / terminal.cols,
            ),
        )
      : null

  return {
    terminalRendererDataset: toNonEmptyString(container?.dataset.coveTerminalRenderer),
    terminalFontSize:
      typeof terminal.options?.fontSize === 'number' ? terminal.options.fontSize : null,
    terminalLineHeight:
      typeof terminal.options?.lineHeight === 'number' ? terminal.options.lineHeight : null,
    terminalLetterSpacing:
      typeof terminal.options?.letterSpacing === 'number' ? terminal.options.letterSpacing : null,
    terminalFontFamily: toNonEmptyString(terminal.options?.fontFamily),
    renderCssCellWidth: cssCellWidth,
    renderCssCellHeight: cssCellHeight,
    renderCssCanvasWidth: cssCanvasWidth,
    renderCssCanvasHeight: cssCanvasHeight,
    renderDeviceCanvasWidth: deviceCanvasWidth,
    renderDeviceCanvasHeight: deviceCanvasHeight,
    expectedTextWidth,
    expectedTextHeight,
    expectedTextOverflowX: overflowX,
    terminalVisibleWidthGapX: visibleWidthGap,
    terminalRightGutterPx,
    screenToScrollbarGapPx,
    screenRectScaleX: screenRectScaleX === null ? null : Math.round(screenRectScaleX * 1000) / 1000,
    screenToScrollbarGapLocalPx,
    textToScrollbarGapPx,
    textToScrollbarGapLocalPx,
    domScrollbarGapSafetyTargetPx,
    xtermPaddingLeft,
    xtermPaddingRight,
    xtermLayoutGutterPx,
    screenRowsOverflowX,
    domContentOverflowBeyondXtermPx,
    domContentOverflowBeyondContainerPx,
    domSafeColsByRowsScrollWidth,
    domSafeColsInputCols,
    domSafeTextWidth: domSafeTextWidth === null ? null : Math.round(domSafeTextWidth * 100) / 100,
    measuredRowCellFootprint:
      measuredRowCellFootprint === null ? null : Math.round(measuredRowCellFootprint * 1000) / 1000,
    hasDomRowTextOverhang,
    maxRowRight,
    maxRowRightLocal,
    maxRowWidth,
    maxSpanRight,
    maxSpanRightLocal,
    rowContentOverflowRightPx,
    rowContentOverflowRightLocalPx,
    spanContentOverflowRightPx,
    spanContentOverflowRightLocalPx,
    visibleTextOverflowRightPx,
    visibleTextOverflowRightLocalPx,
    terminalOverflowX: getComputedStyleValue(container, 'overflow-x'),
    terminalOverflowY: getComputedStyleValue(container, 'overflow-y'),
    terminalContain: getComputedStyleValue(container, 'contain'),
    xtermOverflowX: getComputedStyleValue(xtermElement, 'overflow-x'),
    xtermOverflowY: getComputedStyleValue(xtermElement, 'overflow-y'),
    viewportOverflowX: getComputedStyleValue(viewportElement, 'overflow-x'),
    viewportOverflowY: getComputedStyleValue(viewportElement, 'overflow-y'),
    screenOverflowX: getComputedStyleValue(screenElement, 'overflow-x'),
    screenOverflowY: getComputedStyleValue(screenElement, 'overflow-y'),
    firstRowOverflowX: getComputedStyleValue(firstRowElement, 'overflow-x'),
    firstRowOverflowY: getComputedStyleValue(firstRowElement, 'overflow-y'),
    firstRowSpanOverflowX: getComputedStyleValue(firstRowSpanElement, 'overflow-x'),
    firstRowSpanOverflowY: getComputedStyleValue(firstRowSpanElement, 'overflow-y'),
    maxSpanWidth,
    visibleRowContentOverflowRightPx,
    screenBackgroundColor: getComputedStyleValue(screenElement, 'background-color'),
    screenBorderRightColor: getComputedStyleValue(screenElement, 'border-right-color'),
    screenBorderRightWidth: getComputedPixelValue(screenElement, 'border-right-width'),
    scrollbarDisplay: getComputedStyleValue(scrollbarElement, 'display'),
    scrollbarOpacity: getComputedPixelValue(scrollbarElement, 'opacity'),
    scrollbarBackgroundColor: getComputedStyleValue(scrollbarElement, 'background-color'),
    scrollbarSliderBackgroundColor: getComputedStyleValue(
      scrollbarSliderElement,
      'background-color',
    ),
    overviewRulerDisplay: getComputedStyleValue(overviewRulerElement, 'display'),
    overviewRulerWidth: toFiniteNumber(overviewRulerElement?.getBoundingClientRect().width),
    canvasWidthAttribute: toFiniteNumber(canvasElement?.width),
    canvasHeightAttribute: toFiniteNumber(canvasElement?.height),
    ...getElementRectMetrics(container, 'container'),
    ...getElementRectMetrics(xtermElement, 'xterm'),
    ...getElementRectMetrics(viewportElement, 'viewport'),
    ...getElementRectMetrics(screenElement, 'screen'),
    ...getElementRectMetrics(rowsElement, 'rows'),
    ...getElementRectMetrics(overviewRulerElement, 'overviewRuler'),
    ...getElementRectMetrics(scrollbarElement, 'scrollbar'),
    ...getElementRectMetrics(scrollbarSliderElement, 'scrollbarSlider'),
    ...getElementRectMetrics(canvasElement, 'canvas'),
  }
}

function describeElement(element: Element | null): string | null {
  if (!(element instanceof Element)) {
    return null
  }

  const tagName = element.tagName.toLowerCase()
  const className =
    typeof element.className === 'string'
      ? element.className.trim().split(/\s+/).filter(Boolean).slice(0, 4).join('.')
      : ''

  return className.length > 0 ? `${tagName}.${className}` : tagName
}

export function captureTerminalInteractionDetails({
  container,
  rendererKind,
  point,
}: {
  container: HTMLElement | null
  rendererKind?: 'webgl' | 'dom' | null
  point?: { x: number; y: number } | null
}): Record<string, TerminalDiagnosticsDetailValue> {
  const activeElement = document.activeElement instanceof Element ? document.activeElement : null
  const xtermElement =
    container?.querySelector('.xterm') instanceof HTMLElement
      ? (container.querySelector('.xterm') as HTMLElement)
      : null
  const xtermHelperTextarea =
    container?.querySelector('.xterm-helper-textarea') instanceof HTMLTextAreaElement
      ? (container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement)
      : null
  const viewportElement =
    container?.querySelector('.xterm-viewport') instanceof HTMLElement
      ? (container.querySelector('.xterm-viewport') as HTMLElement)
      : null
  const screenElement =
    container?.querySelector('.xterm-screen') instanceof HTMLElement
      ? (container.querySelector('.xterm-screen') as HTMLElement)
      : null
  const canvasElement =
    screenElement?.querySelector('canvas') instanceof HTMLCanvasElement
      ? (screenElement.querySelector('canvas') as HTMLCanvasElement)
      : null
  const reactFlowNode =
    container?.closest('.react-flow__node') instanceof HTMLElement
      ? (container.closest('.react-flow__node') as HTMLElement)
      : null
  const terminalNode =
    container?.closest('.terminal-node') instanceof HTMLElement
      ? (container.closest('.terminal-node') as HTMLElement)
      : null
  const workspaceCanvas =
    container?.closest('.workspace-canvas') instanceof HTMLElement
      ? (container.closest('.workspace-canvas') as HTMLElement)
      : null
  const hitTarget =
    point && Number.isFinite(point.x) && Number.isFinite(point.y)
      ? document.elementFromPoint(point.x, point.y)
      : null

  const dragSurfaceSelectionMode = workspaceCanvas?.dataset.coveDragSurfaceSelectionMode === 'true'
  const reactFlowNodeSelected = reactFlowNode?.classList.contains('selected') ?? false
  const selectedSurfaceActive = dragSurfaceSelectionMode && reactFlowNodeSelected
  const terminalNodeFocusWithin = safeMatches(terminalNode, ':focus-within')
  const activeElementInsideTerminalNode =
    terminalNode instanceof HTMLElement && activeElement instanceof Element
      ? terminalNode.contains(activeElement)
      : false

  return {
    rendererKind: rendererKind ?? null,
    xtermClassName: toNonEmptyString(xtermElement?.className),
    reactFlowNodeClassName: toNonEmptyString(reactFlowNode?.className),
    terminalNodeClassName: toNonEmptyString(terminalNode?.className),
    activeElement: describeElement(activeElement),
    activeElementInsideTerminalNode,
    terminalNodeFocusWithin,
    terminalNodeBorderColor: getComputedBorderColor(terminalNode),
    dragSurfaceSelectionMode,
    reactFlowNodeSelected,
    selectedSurfaceActive,
    xtermMouseEventsEnabled: xtermElement?.classList.contains('enable-mouse-events') ?? false,
    xtermCursorPointer: xtermElement?.classList.contains('xterm-cursor-pointer') ?? false,
    xtermCursor: getComputedCursor(xtermElement),
    viewportCursor: getComputedCursor(viewportElement),
    screenCursor: getComputedCursor(screenElement),
    canvasCursor: getComputedCursor(canvasElement),
    activeElementCursor: getComputedCursor(activeElement),
    activeElementInsideTerminal: activeElement
      ? activeElement.closest('.terminal-node__terminal') !== null
      : false,
    xtermHelperTextareaPresent: xtermHelperTextarea instanceof HTMLTextAreaElement,
    xtermHelperTextareaFocused: xtermHelperTextarea ? activeElement === xtermHelperTextarea : false,
    hitTarget: describeElement(hitTarget),
    hitTargetCursor: getComputedCursor(hitTarget),
    hitTargetInsideTerminal: hitTarget?.closest('.terminal-node__terminal') !== null,
    hitTargetInsideViewport: hitTarget?.closest('.xterm-viewport') !== null,
    hitTargetInsideScreen: hitTarget?.closest('.xterm-screen') !== null,
    hitTargetInsideSelectedOverlay:
      hitTarget instanceof Element &&
      hitTarget.closest('.react-flow__node.selected') !== null &&
      selectedSurfaceActive,
  }
}

export function resolveTerminalBufferKind(
  terminal: Pick<TerminalForDiagnosticsLike, 'buffer'>,
): TerminalDiagnosticsBufferKind {
  const buffer = terminal.buffer
  if (!buffer?.active) {
    return 'unknown'
  }

  if (buffer.alternate && buffer.active === buffer.alternate) {
    return 'alternate'
  }

  if (buffer.normal && buffer.active === buffer.normal) {
    return 'normal'
  }

  return 'unknown'
}

export function captureTerminalDiagnosticsSnapshot(
  terminal: TerminalForDiagnosticsLike,
  viewportElement: HTMLElement | null,
): TerminalDiagnosticsSnapshot {
  const activeBuffer = terminal.buffer?.active
  const scrollbar =
    viewportElement?.parentElement?.querySelector(
      '.xterm-scrollable-element .scrollbar.vertical',
    ) ?? null

  return {
    bufferKind: resolveTerminalBufferKind(terminal),
    activeBaseY: toFiniteNumber(activeBuffer?.baseY),
    activeViewportY: toFiniteNumber(activeBuffer?.viewportY),
    activeLength: toFiniteNumber(activeBuffer?.length),
    cols: terminal.cols,
    rows: terminal.rows,
    viewportScrollTop: toFiniteNumber(viewportElement?.scrollTop),
    viewportScrollHeight: toFiniteNumber(viewportElement?.scrollHeight),
    viewportClientHeight: toFiniteNumber(viewportElement?.clientHeight),
    hasViewport: viewportElement instanceof HTMLElement,
    hasVerticalScrollbar: scrollbar instanceof HTMLElement,
  }
}

export function createTerminalDiagnosticsLogger({
  enabled,
  emit,
  base,
}: {
  enabled: boolean
  emit: (payload: TerminalDiagnosticsLogInput) => void
  base: Omit<TerminalDiagnosticsLogInput, 'event' | 'snapshot' | 'details'>
}): {
  log: (
    event: string,
    snapshot: TerminalDiagnosticsSnapshot,
    details?: TerminalDiagnosticsLogInput['details'],
  ) => void
} {
  return {
    log: (event, snapshot, details) => {
      if (!enabled) {
        return
      }

      emit({
        ...base,
        event,
        snapshot,
        ...(details ? { details } : {}),
      })
    },
  }
}
