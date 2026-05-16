import { beforeEach, describe, expect, it, vi } from 'vitest'
import { commitTerminalGeometryForCurrentSession } from '../../../src/contexts/workspace/presentation/renderer/components/terminalNode/useCommittedTerminalGeometry'
import {
  commitSettledTerminalNodeGeometry,
  fitTerminalNodeToMeasuredSize,
} from '../../../src/contexts/workspace/presentation/renderer/components/terminalNode/syncTerminalNodeSize'

vi.mock(
  '../../../src/contexts/workspace/presentation/renderer/components/terminalNode/syncTerminalNodeSize',
  () => ({
    commitSettledTerminalNodeGeometry: vi.fn(),
    fitTerminalNodeToMeasuredSize: vi.fn(),
  }),
)

const commitSettledMock = vi.mocked(commitSettledTerminalNodeGeometry)
const fitTerminalNodeToMeasuredSizeMock = vi.mocked(fitTerminalNodeToMeasuredSize)

type CommitParams = Parameters<typeof commitTerminalGeometryForCurrentSession>[0]

function createCommitParams(): CommitParams {
  return {
    terminalRef: { current: null },
    fitAddonRef: { current: null },
    containerRef: { current: null },
    isPointerResizingRef: { current: false },
    lastCommittedPtySizeRef: { current: { cols: 80, rows: 24 } },
    suppressPtyResizeRef: { current: false },
    latestSessionIdRef: { current: 'session-a' },
    sessionId: 'session-a',
    scheduleWebglCanvasTransformCleanup: vi.fn(),
  }
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolveDeferred: (() => void) | null = null
  const promise = new Promise<void>(resolve => {
    resolveDeferred = resolve
  })
  return {
    promise,
    resolve: () => {
      resolveDeferred?.()
    },
  }
}

describe('commitTerminalGeometryForCurrentSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('copies the settled geometry only while the committed session is still current', async () => {
    const params = createCommitParams()
    commitSettledMock.mockImplementationOnce(async options => {
      options.lastCommittedPtySizeRef.current = { cols: 100, rows: 32 }
      return { cols: 100, rows: 32, changed: true }
    })

    await commitTerminalGeometryForCurrentSession(params, 'appearance_commit')

    expect(params.lastCommittedPtySizeRef.current).toStrictEqual({ cols: 100, rows: 32 })
    expect(params.scheduleWebglCanvasTransformCleanup).toHaveBeenCalledTimes(1)
  })

  it('keeps the current session geometry when an async commit finishes after session switch', async () => {
    const params = createCommitParams()
    const resizeBlocked = createDeferred()
    commitSettledMock.mockImplementationOnce(async options => {
      expect(options.lastCommittedPtySizeRef).not.toBe(params.lastCommittedPtySizeRef)
      await resizeBlocked.promise
      options.lastCommittedPtySizeRef.current = { cols: 100, rows: 32 }
      return { cols: 100, rows: 32, changed: true }
    })

    const committed = commitTerminalGeometryForCurrentSession(params, 'frame_commit')
    params.latestSessionIdRef.current = 'session-b'
    resizeBlocked.resolve()
    await committed

    expect(params.lastCommittedPtySizeRef.current).toStrictEqual({ cols: 80, rows: 24 })
    expect(params.scheduleWebglCanvasTransformCleanup).not.toHaveBeenCalled()
  })

  it('only fits local terminal size when PTY resize is suppressed', async () => {
    const params = createCommitParams()
    params.suppressPtyResizeRef.current = true

    await commitTerminalGeometryForCurrentSession(params, 'appearance_commit')

    expect(fitTerminalNodeToMeasuredSizeMock).toHaveBeenCalledTimes(1)
    expect(commitSettledMock).not.toHaveBeenCalled()
  })
})
