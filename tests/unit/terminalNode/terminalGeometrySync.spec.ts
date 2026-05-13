import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  commitInitialTerminalNodeGeometry,
  commitSettledTerminalNodeGeometry,
  commitTerminalNodeGeometry,
  createTerminalDomTextOverhangGeometryCommitScheduler,
  fitTerminalNodeToMeasuredSize,
  refreshTerminalNodeSize,
} from '../../../src/contexts/workspace/presentation/renderer/components/terminalNode/syncTerminalNodeSize'
import {
  createRuntimeInitialGeometryCommitter,
  shouldPreferMeasuredInitialGeometryCommit,
} from '../../../src/contexts/workspace/presentation/renderer/components/terminalNode/useTerminalRuntimeSession.initialGeometry'

function createTerminalMock() {
  const terminal = {
    cols: 80,
    rows: 24,
    element: {
      style: {},
    },
    buffer: {
      active: {
        baseY: 0,
        viewportY: 0,
      },
    },
    scrollToLine: vi.fn((line: number) => {
      terminal.buffer.active.viewportY = line
    }),
    refresh: vi.fn(),
    resize: vi.fn((cols: number, rows: number) => {
      terminal.cols = cols
      terminal.rows = rows
    }),
    _core: {
      _renderService: {
        dimensions: {
          css: {
            cell: {
              height: 12,
            },
          },
        },
      },
      _bufferService: {
        isUserScrolling: false,
        buffer: {
          ydisp: 0,
        },
      },
      _viewport: {
        queueSync: vi.fn((ydisp?: number) => {
          if (typeof ydisp === 'number') {
            terminal.buffer.active.viewportY = ydisp
          }
        }),
        scrollToLine: vi.fn((line: number) => {
          terminal.buffer.active.viewportY = line
        }),
      },
    },
  }

  return terminal
}

function createDomLayoutContainerMock({
  containerWidth,
  xtermWidth,
  screenWidth,
  rowsScrollWidth,
  maxRowRight,
  maxSpanRight,
  scrollbarLeft,
  scrollbarWidth = 10,
  scaleX = 1,
}: {
  containerWidth: number
  xtermWidth: number
  screenWidth: number
  rowsScrollWidth: number
  maxRowRight?: number
  maxSpanRight?: number
  scrollbarLeft?: number
  scrollbarWidth?: number
  scaleX?: number
}) {
  const scaleRectX = (value: number): number => 8 + (value - 8) * scaleX
  const scaleRectWidth = (value: number): number => value * scaleX
  const container = document.createElement('div')
  container.dataset.coveTerminalRenderer = 'dom'
  const xterm = document.createElement('div')
  xterm.className = 'xterm'
  const screen = document.createElement('div')
  screen.className = 'xterm-screen'
  const rows = document.createElement('div')
  rows.className = 'xterm-rows'
  const row = document.createElement('div')
  const span = document.createElement('span')
  row.append(span)
  rows.append(row)
  screen.append(rows)
  if (typeof scrollbarLeft === 'number') {
    const scrollable = document.createElement('div')
    scrollable.className = 'xterm-scrollable-element'
    const scrollbar = document.createElement('div')
    scrollbar.className = 'scrollbar vertical'
    scrollable.append(scrollbar)
    xterm.append(scrollable)
    scrollbar.getBoundingClientRect = () =>
      ({
        left: scaleRectX(scrollbarLeft),
        right: scaleRectX(scrollbarLeft + scrollbarWidth),
        width: scaleRectWidth(scrollbarWidth),
        top: 8,
        bottom: 616,
        height: 608,
        x: scaleRectX(scrollbarLeft),
        y: 8,
        toJSON: () => undefined,
      }) as DOMRect
  }
  xterm.append(screen)
  container.append(xterm)

  Object.defineProperty(container, 'clientWidth', { value: containerWidth, configurable: true })
  Object.defineProperty(container, 'clientHeight', { value: 624, configurable: true })
  Object.defineProperty(xterm, 'clientWidth', { value: xtermWidth, configurable: true })
  Object.defineProperty(screen, 'clientWidth', { value: screenWidth, configurable: true })
  Object.defineProperty(screen, 'scrollWidth', { value: rowsScrollWidth, configurable: true })
  Object.defineProperty(rows, 'scrollWidth', { value: rowsScrollWidth, configurable: true })
  screen.getBoundingClientRect = () =>
    ({
      left: 8,
      right: 8 + scaleRectWidth(screenWidth),
      width: scaleRectWidth(screenWidth),
      top: 0,
      bottom: 624,
      height: 624,
      x: 8,
      y: 0,
      toJSON: () => undefined,
    }) as DOMRect
  row.getBoundingClientRect = () =>
    ({
      left: 8,
      right: scaleRectX(maxRowRight ?? 8 + rowsScrollWidth),
      width: scaleRectX(maxRowRight ?? 8 + rowsScrollWidth) - 8,
      top: 0,
      bottom: 15,
      height: 15,
      x: 8,
      y: 0,
      toJSON: () => undefined,
    }) as DOMRect
  span.getBoundingClientRect = () =>
    ({
      left: 8,
      right: scaleRectX(maxSpanRight ?? maxRowRight ?? 8 + rowsScrollWidth),
      width: scaleRectX(maxSpanRight ?? maxRowRight ?? 8 + rowsScrollWidth) - 8,
      top: 0,
      bottom: 15,
      height: 15,
      x: 8,
      y: 0,
      toJSON: () => undefined,
    }) as DOMRect
  return container
}

describe('terminal geometry sync helpers', () => {
  const ptyResize = vi.fn()

  beforeEach(() => {
    ptyResize.mockReset()
    vi.stubGlobal('window', {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        callback(0)
        return 1
      },
      cancelAnimationFrame: vi.fn(),
      setTimeout: (callback: () => void) => {
        callback()
        return 1
      },
      opencoveApi: {
        pty: {
          resize: ptyResize,
        },
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('refreshes layout without writing PTY geometry', () => {
    const terminal = createTerminalMock()

    refreshTerminalNodeSize({
      terminalRef: { current: terminal as never },
      containerRef: { current: { clientWidth: 640, clientHeight: 320 } as never },
      isPointerResizingRef: { current: false },
    })

    expect(terminal.refresh).toHaveBeenCalledWith(0, 23)
    expect(ptyResize).not.toHaveBeenCalled()
  })

  it('ignores transient detached renderer errors during refresh', () => {
    const terminal = createTerminalMock()
    terminal.refresh = vi.fn(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'dimensions')")
    })

    expect(() => {
      refreshTerminalNodeSize({
        terminalRef: { current: terminal as never },
        containerRef: { current: { clientWidth: 640, clientHeight: 320 } as never },
        isPointerResizingRef: { current: false },
      })
    }).not.toThrow()

    expect(ptyResize).not.toHaveBeenCalled()
  })

  it('forces stale DOM renderer dimensions when the render service queues resize while paused', () => {
    const terminal = createTerminalMock()
    terminal.cols = 97
    terminal.rows = 39
    const cellWidth = 7.140625
    const cellHeight = 15.222222222222221
    terminal._core._renderService.dimensions = {
      css: {
        cell: {
          width: cellWidth,
          height: cellHeight,
        },
        canvas: {
          width: 457,
          height: 274,
        },
      },
    }
    const renderServiceHandleResize = vi.fn()
    const domRendererHandleResize = vi.fn((cols: number, rows: number) => {
      terminal._core._renderService.dimensions.css.canvas = {
        width: Math.round(cols * cellWidth),
        height: Math.round(rows * cellHeight),
      }
    })
    Object.assign(terminal._core._renderService, {
      handleResize: renderServiceHandleResize,
      _renderer: {
        value: {
          handleResize: domRendererHandleResize,
        },
      },
    })

    refreshTerminalNodeSize({
      terminalRef: { current: terminal as never },
      containerRef: {
        current: createDomLayoutContainerMock({
          containerWidth: 748,
          xtermWidth: 748,
          screenWidth: 457,
          rowsScrollWidth: 457,
        }) as never,
      },
      isPointerResizingRef: { current: false },
    })

    expect(renderServiceHandleResize).toHaveBeenCalledWith(97, 39)
    expect(domRendererHandleResize).toHaveBeenCalledWith(97, 39)
    expect(terminal._core._renderService.dimensions.css.canvas.width).toBe(693)
    expect(terminal.refresh).toHaveBeenCalledWith(0, 38)
    expect(ptyResize).not.toHaveBeenCalled()
  })

  it('clamps xterm border-box height without dropping terminal padding', () => {
    const terminal = createTerminalMock()
    ;(
      window as unknown as { getComputedStyle: (element: unknown) => CSSStyleDeclaration }
    ).getComputedStyle = () =>
      ({
        boxSizing: 'border-box',
        paddingTop: '8px',
        paddingBottom: '8px',
      }) as CSSStyleDeclaration

    refreshTerminalNodeSize({
      terminalRef: { current: terminal as never },
      containerRef: { current: { clientWidth: 640, clientHeight: 320 } as never },
      isPointerResizingRef: { current: false },
    })

    expect(terminal.element.style.height).toBe('304px')
    expect(ptyResize).not.toHaveBeenCalled()
  })

  it('commits measured geometry only on explicit commit', () => {
    const terminal = createTerminalMock()

    commitTerminalNodeGeometry({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 96, rows: 30 })),
        } as never,
      },
      containerRef: { current: { clientWidth: 640, clientHeight: 320 } as never },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef: { current: { cols: 80, rows: 24 } },
      sessionId: 'session-geometry',
      reason: 'frame_commit',
    })

    expect(terminal.resize).toHaveBeenCalledWith(96, 30)
    expect(terminal.refresh).toHaveBeenCalledWith(0, 29)
    expect(ptyResize).toHaveBeenCalledWith({
      sessionId: 'session-geometry',
      cols: 96,
      rows: 30,
      reason: 'frame_commit',
    })
  })

  it('can locally fit a placeholder without writing PTY geometry', () => {
    const terminal = createTerminalMock()

    const size = fitTerminalNodeToMeasuredSize({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 64, rows: 44 })),
        } as never,
      },
      containerRef: { current: { clientWidth: 640, clientHeight: 660 } as never },
      isPointerResizingRef: { current: false },
    })

    expect(size).toStrictEqual({ cols: 64, rows: 44 })
    expect(terminal.resize).toHaveBeenCalledWith(64, 44)
    expect(terminal.refresh).toHaveBeenCalledWith(0, 43)
    expect(ptyResize).not.toHaveBeenCalled()
  })

  it('keeps the FitAddon right gutter instead of reclaiming it as text columns', () => {
    const terminal = createTerminalMock()
    terminal._core._renderService.dimensions.css.cell = {
      width: 7.28,
      height: 12,
    }

    const size = fitTerminalNodeToMeasuredSize({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 121, rows: 40 })),
        } as never,
      },
      containerRef: { current: { clientWidth: 898, clientHeight: 624 } as never },
      isPointerResizingRef: { current: false },
    })

    expect(size).toStrictEqual({ cols: 121, rows: 40 })
    expect(terminal.resize).toHaveBeenCalledWith(121, 40)
  })

  it('shrinks DOM renderer geometry when real row content would be clipped by xterm overflow', () => {
    const terminal = createTerminalMock()
    terminal.cols = 117
    terminal.rows = 40
    terminal._core._renderService.dimensions.css.cell = {
      width: 7.282051282051282,
      height: 15.2,
    }

    const size = fitTerminalNodeToMeasuredSize({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 117, rows: 40 })),
        } as never,
      },
      containerRef: {
        current: createDomLayoutContainerMock({
          containerWidth: 865,
          xtermWidth: 865,
          screenWidth: 852,
          rowsScrollWidth: 884,
          maxRowRight: 892,
        }) as never,
      },
      isPointerResizingRef: { current: false },
    })

    expect(size).toStrictEqual({ cols: 111, rows: 40 })
    expect(terminal.resize).toHaveBeenCalledWith(111, 40)
  })

  it('does not reserve DOM renderer overhang space when rows match the measured cell width', () => {
    const terminal = createTerminalMock()
    terminal.cols = 108
    terminal.rows = 40
    terminal._core._renderService.dimensions.css.cell = {
      width: 7.28,
      height: 15.2,
    }

    const size = fitTerminalNodeToMeasuredSize({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 108, rows: 40 })),
        } as never,
      },
      containerRef: {
        current: createDomLayoutContainerMock({
          containerWidth: 813,
          xtermWidth: 813,
          screenWidth: 786,
          rowsScrollWidth: 786,
        }) as never,
      },
      isPointerResizingRef: { current: false },
    })

    expect(size).toStrictEqual({ cols: 108, rows: 40 })
    expect(terminal.resize).not.toHaveBeenCalled()
  })

  it('keeps DOM renderer text close to the scrollbar when the measured gap is already safe', () => {
    const terminal = createTerminalMock()
    terminal.cols = 107
    terminal.rows = 37
    terminal._core._renderService.dimensions.css.cell = {
      width: 7.149532710280374,
      height: 15.2,
    }

    const size = fitTerminalNodeToMeasuredSize({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 107, rows: 37 })),
        } as never,
      },
      containerRef: {
        current: createDomLayoutContainerMock({
          containerWidth: 790,
          xtermWidth: 790,
          screenWidth: 765,
          rowsScrollWidth: 796,
          maxRowRight: 773,
          scrollbarLeft: 780.4,
        }) as never,
      },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef: { current: { cols: 107, rows: 37 } },
    })

    expect(size).toBeNull()
    expect(terminal.resize).not.toHaveBeenCalled()
  })

  it('keeps the DOM renderer scrollbar gap decision in unscaled CSS pixels', () => {
    const terminal = createTerminalMock()
    terminal.cols = 107
    terminal.rows = 37
    terminal._core._renderService.dimensions.css.cell = {
      width: 7.149532710280374,
      height: 15.2,
    }

    const size = fitTerminalNodeToMeasuredSize({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 107, rows: 37 })),
        } as never,
      },
      containerRef: {
        current: createDomLayoutContainerMock({
          containerWidth: 790,
          xtermWidth: 790,
          screenWidth: 765,
          rowsScrollWidth: 765,
          maxRowRight: 773,
          scrollbarLeft: 780.4,
          scaleX: 0.7,
        }) as never,
      },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef: { current: { cols: 107, rows: 37 } },
    })

    expect(size).toBeNull()
    expect(terminal.resize).not.toHaveBeenCalled()
  })

  it('uses visible DOM row overflow when keeping text away from the scrollbar', () => {
    const terminal = createTerminalMock()
    terminal.cols = 117
    terminal.rows = 36
    terminal._core._renderService.dimensions.css.cell = {
      width: 7.145299145299146,
      height: 15.2,
    }

    const size = fitTerminalNodeToMeasuredSize({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 117, rows: 36 })),
        } as never,
      },
      containerRef: {
        current: createDomLayoutContainerMock({
          containerWidth: 867,
          xtermWidth: 867,
          screenWidth: 836,
          rowsScrollWidth: 836,
          maxRowRight: 851,
          maxSpanRight: 851,
          scrollbarLeft: 852,
        }) as never,
      },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef: { current: { cols: 117, rows: 36 } },
    })

    expect(size).toStrictEqual({ cols: 116, rows: 36 })
    expect(terminal.resize).toHaveBeenCalledWith(116, 36)
  })

  it('keeps DOM renderer geometry capped after a previous overhang correction', () => {
    const terminal = createTerminalMock()
    terminal.cols = 114
    terminal.rows = 40
    terminal._core._renderService.dimensions.css.cell = {
      width: 7.282051282051282,
      height: 15.2,
    }

    const size = fitTerminalNodeToMeasuredSize({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 117, rows: 40 })),
        } as never,
      },
      containerRef: {
        current: createDomLayoutContainerMock({
          containerWidth: 865,
          xtermWidth: 865,
          screenWidth: 830,
          rowsScrollWidth: 861,
          maxRowRight: 869,
        }) as never,
      },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef: { current: { cols: 114, rows: 40 } },
    })

    expect(size).toStrictEqual({ cols: 111, rows: 40 })
    expect(terminal.resize).toHaveBeenCalledWith(111, 40)
  })

  it('commits a smaller DOM renderer geometry after text output exposes clipped content', () => {
    const terminal = createTerminalMock()
    terminal.cols = 117
    terminal.rows = 40
    terminal._core._renderService.dimensions.css.cell = {
      width: 7.282051282051282,
      height: 15.2,
    }
    const lastCommittedPtySizeRef = { current: { cols: 117, rows: 40 } }

    const scheduler = createTerminalDomTextOverhangGeometryCommitScheduler({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 117, rows: 40 })),
        } as never,
      },
      containerRef: {
        current: createDomLayoutContainerMock({
          containerWidth: 865,
          xtermWidth: 865,
          screenWidth: 852,
          rowsScrollWidth: 884,
          maxRowRight: 892,
        }) as never,
      },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef,
      suppressPtyResizeRef: { current: false },
      sessionId: 'session-dom-overhang',
    })

    scheduler.schedule()

    expect(terminal.resize).toHaveBeenCalledWith(111, 40)
    expect(terminal.refresh).toHaveBeenCalledWith(0, 39)
    expect(lastCommittedPtySizeRef.current).toStrictEqual({ cols: 111, rows: 40 })
    expect(ptyResize).toHaveBeenCalledWith({
      sessionId: 'session-dom-overhang',
      cols: 111,
      rows: 40,
      reason: 'appearance_commit',
    })
  })

  it('does not cascade DOM overhang correction across repeated output frames', () => {
    const animationFrames: FrameRequestCallback[] = []
    ;(window as unknown as typeof window).requestAnimationFrame = vi.fn(
      (callback: FrameRequestCallback) => {
        animationFrames.push(callback)
        return animationFrames.length
      },
    )
    const flushAnimationFrames = (): void => {
      while (animationFrames.length > 0) {
        animationFrames.shift()?.(0)
      }
    }
    const terminal = createTerminalMock()
    terminal.cols = 117
    terminal.rows = 40
    terminal._core._renderService.dimensions.css.cell = {
      width: 7.282051282051282,
      height: 15.2,
    }
    const lastCommittedPtySizeRef = { current: { cols: 117, rows: 40 } }

    const scheduler = createTerminalDomTextOverhangGeometryCommitScheduler({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 117, rows: 40 })),
        } as never,
      },
      containerRef: {
        current: createDomLayoutContainerMock({
          containerWidth: 865,
          xtermWidth: 865,
          screenWidth: 852,
          rowsScrollWidth: 884,
          maxRowRight: 892,
        }) as never,
      },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef,
      suppressPtyResizeRef: { current: false },
      sessionId: 'session-dom-overhang-repeat',
    })

    scheduler.schedule()
    flushAnimationFrames()
    scheduler.schedule()
    flushAnimationFrames()

    expect(terminal.resize).toHaveBeenCalledTimes(1)
    expect(terminal.resize).toHaveBeenCalledWith(111, 40)
    expect(lastCommittedPtySizeRef.current).toStrictEqual({ cols: 111, rows: 40 })
    expect(ptyResize).toHaveBeenCalledTimes(1)
    expect(ptyResize).toHaveBeenCalledWith({
      sessionId: 'session-dom-overhang-repeat',
      cols: 111,
      rows: 40,
      reason: 'appearance_commit',
    })
  })

  it('recovers from a previous DOM overhang correction when later output leaves a wide safe gap', () => {
    const animationFrames: FrameRequestCallback[] = []
    ;(window as unknown as typeof window).requestAnimationFrame = vi.fn(
      (callback: FrameRequestCallback) => {
        animationFrames.push(callback)
        return animationFrames.length
      },
    )
    const flushAnimationFrames = (): void => {
      while (animationFrames.length > 0) {
        animationFrames.shift()?.(0)
      }
    }
    const terminal = createTerminalMock()
    terminal.cols = 92
    terminal.rows = 40
    terminal._core._renderService.dimensions.css.cell = {
      width: 7.142857142857143,
      height: 15.2,
    }
    const lastCommittedPtySizeRef = { current: { cols: 92, rows: 40 } }
    const containerRef = {
      current: createDomLayoutContainerMock({
        containerWidth: 722,
        xtermWidth: 722,
        screenWidth: 658,
        rowsScrollWidth: 690,
        maxRowRight: 698,
      }) as HTMLElement,
    }

    const scheduler = createTerminalDomTextOverhangGeometryCommitScheduler({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 97, rows: 40 })),
        } as never,
      },
      containerRef: containerRef as never,
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef,
      suppressPtyResizeRef: { current: false },
      sessionId: 'session-dom-overhang-recover',
    })

    scheduler.schedule()
    flushAnimationFrames()

    expect(terminal.resize).toHaveBeenCalledWith(91, 40)
    expect(lastCommittedPtySizeRef.current).toStrictEqual({ cols: 91, rows: 40 })

    containerRef.current = createDomLayoutContainerMock({
      containerWidth: 722,
      xtermWidth: 722,
      screenWidth: 650,
      rowsScrollWidth: 662,
      maxRowRight: 670.45,
      scrollbarLeft: 704.4,
    })
    scheduler.schedule()
    flushAnimationFrames()

    expect(terminal.resize).toHaveBeenLastCalledWith(94, 40)
    expect(lastCommittedPtySizeRef.current).toStrictEqual({ cols: 94, rows: 40 })
    expect(ptyResize).toHaveBeenLastCalledWith({
      sessionId: 'session-dom-overhang-recover',
      cols: 94,
      rows: 40,
      reason: 'appearance_commit',
    })
  })

  it('commits a smaller DOM renderer geometry when glyph overhang reaches the scrollbar', () => {
    const terminal = createTerminalMock()
    terminal.cols = 107
    terminal.rows = 40
    terminal._core._renderService.dimensions.css.cell = {
      width: 7.280373831775701,
      height: 15.2,
    }
    const lastCommittedPtySizeRef = { current: { cols: 107, rows: 40 } }

    const scheduler = createTerminalDomTextOverhangGeometryCommitScheduler({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 108, rows: 40 })),
        } as never,
      },
      containerRef: {
        current: createDomLayoutContainerMock({
          containerWidth: 813,
          xtermWidth: 813,
          screenWidth: 779,
          rowsScrollWidth: 811,
          maxRowRight: 819,
        }) as never,
      },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef,
      suppressPtyResizeRef: { current: false },
      sessionId: 'session-dom-scrollbar-overhang',
    })

    scheduler.schedule()

    expect(terminal.resize).toHaveBeenCalledWith(102, 40)
    expect(lastCommittedPtySizeRef.current).toStrictEqual({ cols: 102, rows: 40 })
    expect(ptyResize).toHaveBeenCalledWith({
      sessionId: 'session-dom-scrollbar-overhang',
      cols: 102,
      rows: 40,
      reason: 'appearance_commit',
    })
  })

  it('ignores output-time DOM renderer measurements when rows already fit before the scrollbar', () => {
    const terminal = createTerminalMock()
    terminal.cols = 103
    terminal.rows = 46
    terminal._core._renderService.dimensions.css.cell = {
      width: 7.15,
      height: 15.2,
    }
    const lastCommittedPtySizeRef = { current: { cols: 103, rows: 46 } }

    const scheduler = createTerminalDomTextOverhangGeometryCommitScheduler({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 104, rows: 46 })),
        } as never,
      },
      containerRef: {
        current: createDomLayoutContainerMock({
          containerWidth: 780,
          xtermWidth: 780,
          screenWidth: 736.45,
          rowsScrollWidth: 736.45,
          maxRowRight: 744.45,
          scrollbarLeft: 764.45,
        }) as never,
      },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef,
      suppressPtyResizeRef: { current: false },
      sessionId: 'session-dom-no-overhang',
    })

    scheduler.schedule()

    expect(terminal.resize).not.toHaveBeenCalled()
    expect(lastCommittedPtySizeRef.current).toStrictEqual({ cols: 103, rows: 46 })
    expect(ptyResize).not.toHaveBeenCalled()
  })

  it('does not use output-time DOM checks as a plain fit commit without overhang', () => {
    const terminal = createTerminalMock()
    terminal.cols = 103
    terminal.rows = 46
    terminal._core._renderService.dimensions.css.cell = {
      width: 7.15,
      height: 15.2,
    }
    const lastCommittedPtySizeRef = { current: { cols: 103, rows: 46 } }

    const scheduler = createTerminalDomTextOverhangGeometryCommitScheduler({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 102, rows: 46 })),
        } as never,
      },
      containerRef: {
        current: createDomLayoutContainerMock({
          containerWidth: 780,
          xtermWidth: 780,
          screenWidth: 729.3,
          rowsScrollWidth: 729.3,
        }) as never,
      },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef,
      suppressPtyResizeRef: { current: false },
      sessionId: 'session-dom-plain-fit-shrink',
    })

    scheduler.schedule()

    expect(terminal.resize).not.toHaveBeenCalled()
    expect(lastCommittedPtySizeRef.current).toStrictEqual({ cols: 103, rows: 46 })
    expect(ptyResize).not.toHaveBeenCalled()
  })

  it('moves DOM renderer text back toward the scrollbar when the safety gap was too wide', () => {
    const terminal = createTerminalMock()
    terminal.cols = 108
    terminal.rows = 40
    terminal._core._renderService.dimensions.css.cell = {
      width: 7.287037037037037,
      height: 15.2,
    }

    const size = fitTerminalNodeToMeasuredSize({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 115, rows: 40 })),
        } as never,
      },
      containerRef: {
        current: createDomLayoutContainerMock({
          containerWidth: 864,
          xtermWidth: 864,
          screenWidth: 787,
          rowsScrollWidth: 812,
          maxRowRight: 820,
        }) as never,
      },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef: { current: { cols: 108, rows: 40 } },
    })

    expect(size).toStrictEqual({ cols: 110, rows: 40 })
    expect(terminal.resize).toHaveBeenCalledWith(110, 40)
  })

  it('restores local terminal geometry when measured size already matches committed PTY geometry', () => {
    const terminal = createTerminalMock()
    terminal.cols = 111
    terminal.rows = 40

    const size = fitTerminalNodeToMeasuredSize({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 117, rows: 40 })),
        } as never,
      },
      containerRef: { current: { clientWidth: 864, clientHeight: 624 } as never },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef: { current: { cols: 117, rows: 40 } },
    })

    expect(size).toBeNull()
    expect(terminal.resize).toHaveBeenCalledWith(117, 40)
    expect(terminal.refresh).toHaveBeenCalledWith(0, 39)
    expect(ptyResize).not.toHaveBeenCalled()
  })

  it('ignores DOM scrollWidth noise when visible rows are not clipped', () => {
    const terminal = createTerminalMock()
    terminal.cols = 105
    terminal.rows = 36
    terminal._core._renderService.dimensions.css.cell = {
      width: 7.285714285714286,
      height: 15.2,
    }

    const size = fitTerminalNodeToMeasuredSize({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 110, rows: 36 })),
        } as never,
      },
      containerRef: {
        current: createDomLayoutContainerMock({
          containerWidth: 832,
          xtermWidth: 832,
          screenWidth: 765,
          rowsScrollWidth: 791,
          maxRowRight: 773,
        }) as never,
      },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef: { current: { cols: 105, rows: 36 } },
    })

    expect(size).toStrictEqual({ cols: 110, rows: 36 })
    expect(terminal.resize).toHaveBeenCalledWith(110, 36)
  })

  it('keeps a one-cell visual gap from the DOM renderer screen to the scrollbar after calibration', () => {
    const terminal = createTerminalMock()
    terminal.cols = 117
    terminal.rows = 36
    terminal._core._renderService.dimensions.css.cell = {
      width: 7.145299145299146,
      height: 15.2,
    }

    const size = fitTerminalNodeToMeasuredSize({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 117, rows: 36 })),
        } as never,
      },
      containerRef: {
        current: createDomLayoutContainerMock({
          containerWidth: 867,
          xtermWidth: 867,
          screenWidth: 836,
          rowsScrollWidth: 867,
          maxRowRight: 844,
          scrollbarLeft: 849.4,
        }) as never,
      },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef: { current: { cols: 117, rows: 36 } },
    })

    expect(size).toStrictEqual({ cols: 116, rows: 36 })
    expect(terminal.resize).toHaveBeenCalledWith(116, 36)
  })

  it('keeps an extra visual gap from DOM renderer glyph overhang to the scrollbar after calibration', () => {
    const terminal = createTerminalMock()
    terminal.cols = 117
    terminal.rows = 36
    terminal._core._renderService.dimensions.css.cell = {
      width: 7.145299145299146,
      height: 15.2,
    }

    const size = fitTerminalNodeToMeasuredSize({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 117, rows: 36 })),
        } as never,
      },
      containerRef: {
        current: createDomLayoutContainerMock({
          containerWidth: 867,
          xtermWidth: 867,
          screenWidth: 836,
          rowsScrollWidth: 836,
          maxRowRight: 844,
          maxSpanRight: 851.8,
          scrollbarLeft: 852,
        }) as never,
      },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef: { current: { cols: 117, rows: 36 } },
    })

    expect(size).toStrictEqual({ cols: 115, rows: 36 })
    expect(terminal.resize).toHaveBeenCalledWith(115, 36)
  })

  it('only removes the DOM renderer columns needed for a one-cell scrollbar gap', () => {
    const terminal = createTerminalMock()
    terminal.cols = 117
    terminal.rows = 36
    terminal._core._renderService.dimensions.css.cell = {
      width: 7.145299145299146,
      height: 15.2,
    }

    const size = fitTerminalNodeToMeasuredSize({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 117, rows: 36 })),
        } as never,
      },
      containerRef: {
        current: createDomLayoutContainerMock({
          containerWidth: 867,
          xtermWidth: 867,
          screenWidth: 836,
          rowsScrollWidth: 867,
          maxRowRight: 844,
          scrollbarLeft: 849.4,
        }) as never,
      },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef: { current: { cols: 117, rows: 36 } },
    })

    expect(size).toStrictEqual({ cols: 116, rows: 36 })
    expect(terminal.resize).toHaveBeenCalledWith(116, 36)
  })

  it('keeps DOM geometry stable when only rows scrollWidth reaches the scrollbar after resize', () => {
    const terminal = createTerminalMock()
    terminal.cols = 107
    terminal.rows = 37
    terminal._core._renderService.dimensions.css.cell = {
      width: 7.149532710280374,
      height: 15.2,
    }

    const size = fitTerminalNodeToMeasuredSize({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 107, rows: 37 })),
        } as never,
      },
      containerRef: {
        current: createDomLayoutContainerMock({
          containerWidth: 790,
          xtermWidth: 790,
          screenWidth: 765,
          rowsScrollWidth: 796,
          maxRowRight: 773,
          scrollbarLeft: 780.4,
        }) as never,
      },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef: { current: { cols: 107, rows: 37 } },
    })

    expect(size).toBeNull()
    expect(terminal.resize).not.toHaveBeenCalled()
  })

  it('shrinks one more column when the current DOM screen is already inside the scrollbar gap', () => {
    const terminal = createTerminalMock()
    terminal.cols = 115
    terminal.rows = 38
    terminal._core._renderService.dimensions.css.cell = {
      width: 7.146551724137931,
      height: 15.2,
    }

    const size = fitTerminalNodeToMeasuredSize({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 117, rows: 38 })),
        } as never,
      },
      containerRef: {
        current: createDomLayoutContainerMock({
          containerWidth: 859,
          xtermWidth: 859,
          screenWidth: 829,
          rowsScrollWidth: 829,
          maxRowRight: 837,
          scrollbarLeft: 841.4,
        }) as never,
      },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef: { current: { cols: 115, rows: 38 } },
    })

    expect(size).toStrictEqual({ cols: 114, rows: 38 })
    expect(terminal.resize).toHaveBeenCalledWith(114, 38)
  })

  it('does not refresh DOM renderer geometry after overhang correction is stable', () => {
    const terminal = createTerminalMock()
    terminal.cols = 110
    terminal.rows = 40
    terminal._core._renderService.dimensions.css.cell = {
      width: 7.287037037037037,
      height: 15.2,
    }
    const lastCommittedPtySizeRef = { current: { cols: 110, rows: 40 } }

    const scheduler = createTerminalDomTextOverhangGeometryCommitScheduler({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 115, rows: 40 })),
        } as never,
      },
      containerRef: {
        current: createDomLayoutContainerMock({
          containerWidth: 864,
          xtermWidth: 864,
          screenWidth: 801,
          rowsScrollWidth: 827,
        }) as never,
      },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef,
      suppressPtyResizeRef: { current: false },
      sessionId: 'session-dom-overhang-stable',
    })

    scheduler.schedule()

    expect(terminal.resize).not.toHaveBeenCalled()
    expect(terminal.refresh).not.toHaveBeenCalled()
    expect(lastCommittedPtySizeRef.current).toStrictEqual({ cols: 110, rows: 40 })
    expect(ptyResize).not.toHaveBeenCalled()
  })

  it('preserves scroll offset when local measured geometry resizes the xterm viewport', () => {
    const terminal = createTerminalMock()
    terminal.buffer.active.baseY = 220
    terminal.buffer.active.viewportY = 190
    terminal._core._bufferService.isUserScrolling = true
    terminal._core._bufferService.buffer.ydisp = 190

    const size = fitTerminalNodeToMeasuredSize({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 96, rows: 30 })),
        } as never,
      },
      containerRef: { current: { clientWidth: 760, clientHeight: 460 } as never },
      isPointerResizingRef: { current: false },
    })

    expect(size).toStrictEqual({ cols: 96, rows: 30 })
    expect(terminal.resize).toHaveBeenCalledWith(96, 30)
    expect(terminal.buffer.active.viewportY).toBe(190)
    expect(terminal._core._bufferService.isUserScrolling).toBe(true)
    expect(terminal._core._bufferService.buffer.ydisp).toBe(190)
    expect(terminal._core._viewport.scrollToLine).toHaveBeenCalledWith(190, true)
  })

  it('waits for stable measured geometry before the initial restore commit', async () => {
    const terminal = createTerminalMock()
    const lastCommittedPtySizeRef: { current: { cols: number; rows: number } | null } = {
      current: null,
    }

    const size = await commitInitialTerminalNodeGeometry({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi
            .fn()
            .mockReturnValueOnce({ cols: 80, rows: 24 })
            .mockReturnValueOnce({ cols: 132, rows: 41 })
            .mockReturnValueOnce({ cols: 132, rows: 41 }),
        } as never,
      },
      containerRef: { current: { clientWidth: 910, clientHeight: 620 } as never },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef,
      sessionId: 'session-initial-geometry',
      reason: 'frame_commit',
    })

    expect(size).toStrictEqual({ cols: 132, rows: 41, changed: true })
    expect(lastCommittedPtySizeRef.current).toStrictEqual({ cols: 132, rows: 41 })
    expect(ptyResize).toHaveBeenCalledWith({
      sessionId: 'session-initial-geometry',
      cols: 132,
      rows: 41,
      reason: 'frame_commit',
    })
  })

  it('keeps settling when the initial mounted measurement expands after early stable frames', async () => {
    const terminal = createTerminalMock()
    const lastCommittedPtySizeRef: { current: { cols: number; rows: number } | null } = {
      current: null,
    }

    const size = await commitInitialTerminalNodeGeometry({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi
            .fn()
            .mockReturnValueOnce({ cols: 97, rows: 40 })
            .mockReturnValueOnce({ cols: 97, rows: 40 })
            .mockReturnValueOnce({ cols: 104, rows: 41 })
            .mockReturnValue({ cols: 104, rows: 41 }),
        } as never,
      },
      containerRef: { current: { clientWidth: 864, clientHeight: 624 } as never },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef,
      sessionId: 'session-initial-post-mount-expand',
      reason: 'frame_commit',
    })

    expect(size).toStrictEqual({ cols: 104, rows: 41, changed: true })
    expect(lastCommittedPtySizeRef.current).toStrictEqual({ cols: 104, rows: 41 })
    expect(terminal.resize).toHaveBeenLastCalledWith(104, 41)
    expect(ptyResize).toHaveBeenCalledWith({
      sessionId: 'session-initial-post-mount-expand',
      cols: 104,
      rows: 41,
      reason: 'frame_commit',
    })
  })

  it('keeps settling when applying the early geometry unlocks the final mounted measurement', async () => {
    const terminal = createTerminalMock()
    const lastCommittedPtySizeRef: { current: { cols: number; rows: number } | null } = {
      current: null,
    }

    const size = await commitInitialTerminalNodeGeometry({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() =>
            terminal.cols < 97 ? { cols: 97, rows: 40 } : { cols: 104, rows: 41 },
          ),
        } as never,
      },
      containerRef: { current: { clientWidth: 864, clientHeight: 624 } as never },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef,
      sessionId: 'session-initial-local-settle-expand',
      reason: 'frame_commit',
    })

    expect(size).toStrictEqual({ cols: 104, rows: 41, changed: true })
    expect(lastCommittedPtySizeRef.current).toStrictEqual({ cols: 104, rows: 41 })
    expect(terminal.resize).toHaveBeenCalledWith(97, 40)
    expect(terminal.resize).toHaveBeenLastCalledWith(104, 41)
    expect(ptyResize).toHaveBeenCalledTimes(1)
    expect(ptyResize).toHaveBeenCalledWith({
      sessionId: 'session-initial-local-settle-expand',
      cols: 104,
      rows: 41,
      reason: 'frame_commit',
    })
  })

  it('uses the settled measured geometry for appearance commits after display metrics change', async () => {
    const terminal = createTerminalMock()
    const lastCommittedPtySizeRef: { current: { cols: number; rows: number } | null } = {
      current: { cols: 97, rows: 40 },
    }

    const size = await commitSettledTerminalNodeGeometry({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi
            .fn()
            .mockReturnValueOnce({ cols: 97, rows: 40 })
            .mockReturnValueOnce({ cols: 97, rows: 40 })
            .mockReturnValueOnce({ cols: 104, rows: 41 })
            .mockReturnValue({ cols: 104, rows: 41 }),
        } as never,
      },
      containerRef: { current: { clientWidth: 864, clientHeight: 624 } as never },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef,
      sessionId: 'session-appearance-post-metrics-expand',
      reason: 'appearance_commit',
    })

    expect(size).toStrictEqual({ cols: 104, rows: 41, changed: true })
    expect(lastCommittedPtySizeRef.current).toStrictEqual({ cols: 104, rows: 41 })
    expect(terminal.resize).toHaveBeenLastCalledWith(104, 41)
    expect(ptyResize).toHaveBeenCalledWith({
      sessionId: 'session-appearance-post-metrics-expand',
      cols: 104,
      rows: 41,
      reason: 'appearance_commit',
    })
  })

  it('does not write PTY geometry when the initial restore size is already canonical', async () => {
    const terminal = createTerminalMock()
    const lastCommittedPtySizeRef: { current: { cols: number; rows: number } | null } = {
      current: { cols: 64, rows: 44 },
    }

    const size = await commitInitialTerminalNodeGeometry({
      terminalRef: { current: terminal as never },
      fitAddonRef: {
        current: {
          proposeDimensions: vi.fn(() => ({ cols: 64, rows: 44 })),
        } as never,
      },
      containerRef: { current: { clientWidth: 640, clientHeight: 660 } as never },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef,
      sessionId: 'session-initial-geometry',
      reason: 'frame_commit',
    })

    expect(size).toStrictEqual({ cols: 64, rows: 44, changed: false })
    expect(terminal.resize).toHaveBeenCalledWith(64, 44)
    expect(ptyResize).not.toHaveBeenCalled()
  })

  it('uses durable runtime geometry locally without writing PTY geometry during restore', async () => {
    const terminal = createTerminalMock()
    const fitAddon = {
      proposeDimensions: vi.fn(() => ({ cols: 65, rows: 44 })),
    }
    const lastCommittedPtySizeRef: { current: { cols: number; rows: number } | null } = {
      current: null,
    }
    const commitInitialGeometry = createRuntimeInitialGeometryCommitter({
      terminalRef: { current: terminal as never },
      fitAddonRef: { current: fitAddon as never },
      containerRef: { current: { clientWidth: 640, clientHeight: 660 } as never },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef,
      sessionId: 'session-runtime-restore',
      canonicalInitialGeometry: { cols: 64, rows: 44 },
      allowMeasuredResizeCommit: true,
    })

    const size = await commitInitialGeometry(null)

    expect(size).toStrictEqual({ cols: 64, rows: 44, changed: false })
    expect(lastCommittedPtySizeRef.current).toStrictEqual({ cols: 64, rows: 44 })
    expect(fitAddon.proposeDimensions).not.toHaveBeenCalled()
    expect(terminal.resize).toHaveBeenCalledWith(64, 44)
    expect(ptyResize).not.toHaveBeenCalled()
  })

  it('commits measured runtime geometry only when no canonical restore geometry exists', async () => {
    const terminal = createTerminalMock()
    const fitAddon = {
      proposeDimensions: vi.fn(() => ({ cols: 65, rows: 44 })),
    }
    const lastCommittedPtySizeRef: { current: { cols: number; rows: number } | null } = {
      current: null,
    }
    const commitInitialGeometry = createRuntimeInitialGeometryCommitter({
      terminalRef: { current: terminal as never },
      fitAddonRef: { current: fitAddon as never },
      containerRef: { current: { clientWidth: 640, clientHeight: 660 } as never },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef,
      sessionId: 'session-runtime-restore',
      canonicalInitialGeometry: null,
      allowMeasuredResizeCommit: true,
    })

    const size = await commitInitialGeometry(null)

    expect(size).toStrictEqual({ cols: 65, rows: 44, changed: true })
    expect(lastCommittedPtySizeRef.current).toStrictEqual({ cols: 65, rows: 44 })
    expect(fitAddon.proposeDimensions).toHaveBeenCalled()
    expect(terminal.resize).toHaveBeenCalledWith(65, 44)
    expect(ptyResize).toHaveBeenCalledWith({
      sessionId: 'session-runtime-restore',
      cols: 65,
      rows: 44,
      reason: 'frame_commit',
    })
  })

  it('prefers measured initial geometry for transient plain terminal restore geometry', () => {
    expect(
      shouldPreferMeasuredInitialGeometryCommit({
        kind: 'terminal',
        isLiveSessionReattach: false,
        canonicalInitialGeometry: null,
        suppressPtyResize: false,
      }),
    ).toBe(true)
  })

  it('keeps durable plain terminal geometry canonical during restore', () => {
    expect(
      shouldPreferMeasuredInitialGeometryCommit({
        kind: 'terminal',
        isLiveSessionReattach: false,
        canonicalInitialGeometry: { cols: 80, rows: 24 },
        suppressPtyResize: false,
      }),
    ).toBe(false)
  })

  it('prefers measured initial geometry for agent live reattach', () => {
    expect(
      shouldPreferMeasuredInitialGeometryCommit({
        kind: 'agent',
        isLiveSessionReattach: true,
        canonicalInitialGeometry: null,
        suppressPtyResize: false,
      }),
    ).toBe(true)
  })

  it('does not prefer measured initial geometry during terminal live reattach or suppressed resize', () => {
    expect(
      shouldPreferMeasuredInitialGeometryCommit({
        kind: 'terminal',
        isLiveSessionReattach: true,
        canonicalInitialGeometry: null,
        suppressPtyResize: false,
      }),
    ).toBe(false)
    expect(
      shouldPreferMeasuredInitialGeometryCommit({
        kind: 'terminal',
        isLiveSessionReattach: false,
        canonicalInitialGeometry: null,
        suppressPtyResize: true,
      }),
    ).toBe(false)
  })

  it('uses worker snapshot geometry locally without writing PTY geometry during restore', async () => {
    const terminal = createTerminalMock()
    const fitAddon = {
      proposeDimensions: vi.fn(() => ({ cols: 65, rows: 44 })),
    }
    const lastCommittedPtySizeRef: { current: { cols: number; rows: number } | null } = {
      current: null,
    }
    const commitInitialGeometry = createRuntimeInitialGeometryCommitter({
      terminalRef: { current: terminal as never },
      fitAddonRef: { current: fitAddon as never },
      containerRef: { current: { clientWidth: 640, clientHeight: 660 } as never },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef,
      sessionId: 'session-runtime-restore',
      canonicalInitialGeometry: null,
      allowMeasuredResizeCommit: true,
    })

    const size = await commitInitialGeometry({
      sessionId: 'session-runtime-restore',
      epoch: 1,
      appliedSeq: 3,
      presentationRevision: 4,
      cols: 72,
      rows: 20,
      bufferKind: 'normal',
      cursor: { x: 0, y: 0 },
      title: '',
      serializedScreen: '',
    } as never)

    expect(size).toStrictEqual({ cols: 72, rows: 20, changed: false })
    expect(lastCommittedPtySizeRef.current).toStrictEqual({ cols: 72, rows: 20 })
    expect(fitAddon.proposeDimensions).not.toHaveBeenCalled()
    expect(terminal.resize).toHaveBeenCalledWith(72, 20)
    expect(ptyResize).not.toHaveBeenCalled()
  })

  it('can reconcile an estimated launch geometry with the mounted xterm measurement', async () => {
    const terminal = createTerminalMock()
    const fitAddon = {
      proposeDimensions: vi.fn(() => ({ cols: 69, rows: 44 })),
    }
    const lastCommittedPtySizeRef: { current: { cols: number; rows: number } | null } = {
      current: null,
    }
    const commitInitialGeometry = createRuntimeInitialGeometryCommitter({
      terminalRef: { current: terminal as never },
      fitAddonRef: { current: fitAddon as never },
      containerRef: { current: { clientWidth: 516, clientHeight: 690 } as never },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef,
      sessionId: 'session-opencode-launch',
      canonicalInitialGeometry: { cols: 64, rows: 45 },
      allowMeasuredResizeCommit: true,
      preferMeasuredGeometryCommit: true,
    })

    const size = await commitInitialGeometry({
      sessionId: 'session-opencode-launch',
      epoch: 1,
      appliedSeq: 3,
      presentationRevision: 4,
      cols: 64,
      rows: 45,
      bufferKind: 'alternate',
      cursor: { x: 0, y: 0 },
      title: 'opencode',
      serializedScreen: 'opencode',
    } as never)

    expect(size).toStrictEqual({ cols: 69, rows: 44, changed: true })
    expect(lastCommittedPtySizeRef.current).toStrictEqual({ cols: 69, rows: 44 })
    expect(fitAddon.proposeDimensions).toHaveBeenCalled()
    expect(terminal.resize).toHaveBeenCalledWith(69, 44)
    expect(ptyResize).toHaveBeenCalledWith({
      sessionId: 'session-opencode-launch',
      cols: 69,
      rows: 44,
      reason: 'frame_commit',
    })
  })

  it('can reconcile a codex agent launch geometry with the mounted xterm measurement', async () => {
    const terminal = createTerminalMock()
    const fitAddon = {
      proposeDimensions: vi.fn(() => ({ cols: 68, rows: 40 })),
    }
    const lastCommittedPtySizeRef: { current: { cols: number; rows: number } | null } = {
      current: null,
    }
    const commitInitialGeometry = createRuntimeInitialGeometryCommitter({
      terminalRef: { current: terminal as never },
      fitAddonRef: { current: fitAddon as never },
      containerRef: { current: { clientWidth: 520, clientHeight: 320 } as never },
      isPointerResizingRef: { current: false },
      lastCommittedPtySizeRef,
      sessionId: 'session-codex-launch',
      canonicalInitialGeometry: { cols: 64, rows: 24 },
      allowMeasuredResizeCommit: true,
      preferMeasuredGeometryCommit: true,
    })

    const size = await commitInitialGeometry({
      sessionId: 'session-codex-launch',
      epoch: 1,
      appliedSeq: 3,
      presentationRevision: 4,
      cols: 64,
      rows: 24,
      bufferKind: 'normal',
      cursor: { x: 0, y: 0 },
      title: 'codex',
      serializedScreen: 'codex',
    } as never)

    expect(size).toStrictEqual({ cols: 68, rows: 40, changed: true })
    expect(lastCommittedPtySizeRef.current).toStrictEqual({ cols: 68, rows: 40 })
    expect(fitAddon.proposeDimensions).toHaveBeenCalled()
    expect(terminal.resize).toHaveBeenCalledWith(68, 40)
    expect(ptyResize).toHaveBeenCalledWith({
      sessionId: 'session-codex-launch',
      cols: 68,
      rows: 40,
      reason: 'frame_commit',
    })
  })
})
