import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TerminalSessionManager,
  type SessionManagerDeps,
} from '../../../src/contexts/terminal/presentation/main-ipc/sessionManager'

function createSessionStateWatcher(): SessionManagerDeps['sessionStateWatcher'] {
  return {
    start: vi.fn(),
    noteInteraction: vi.fn(),
    disposeSession: vi.fn(),
    dispose: vi.fn(),
  }
}

function createManager() {
  const sendPtyDataToSubscriber = vi.fn()
  const onProbeSubscriptionChanged = vi.fn()
  const manager = new TerminalSessionManager({
    sendToAllWindows: vi.fn(),
    sendPtyDataToSubscriber,
    trackWebContentsDestroyed: vi.fn(() => true),
    sessionStateWatcher: createSessionStateWatcher(),
    onProbeSubscriptionChanged,
  })

  return { manager, sendPtyDataToSubscriber, onProbeSubscriptionChanged }
}

describe('TerminalSessionManager attach replay', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('replays flushed PTY output to a subscriber attaching from an older seq', async () => {
    vi.useFakeTimers()
    const { manager, sendPtyDataToSubscriber } = createManager()

    manager.registerSession('session-1')
    manager.handleData('session-1', 'Ready.\r\n')
    await vi.advanceTimersByTimeAsync(40)

    expect(sendPtyDataToSubscriber).not.toHaveBeenCalled()

    manager.attach(1, 'session-1', 0)

    expect(sendPtyDataToSubscriber).toHaveBeenCalledTimes(1)
    expect(sendPtyDataToSubscriber).toHaveBeenCalledWith(1, {
      sessionId: 'session-1',
      seq: 1,
      data: 'Ready.\r\n',
    })

    manager.dispose()
  })

  it('does not replay PTY output already covered by afterSeq', async () => {
    vi.useFakeTimers()
    const { manager, sendPtyDataToSubscriber } = createManager()

    manager.registerSession('session-1')
    manager.handleData('session-1', 'Ready.\r\n')
    await vi.advanceTimersByTimeAsync(40)

    manager.attach(1, 'session-1', 1)

    expect(sendPtyDataToSubscriber).not.toHaveBeenCalled()

    manager.dispose()
  })

  it('flushes pending PTY output before attach and delivers it once', () => {
    vi.useFakeTimers()
    const { manager, sendPtyDataToSubscriber } = createManager()

    manager.registerSession('session-1')
    manager.handleData('session-1', 'Ready.\r\n')
    manager.attach(1, 'session-1', 0)

    expect(sendPtyDataToSubscriber).toHaveBeenCalledTimes(1)
    expect(sendPtyDataToSubscriber).toHaveBeenCalledWith(1, {
      sessionId: 'session-1',
      seq: 1,
      data: 'Ready.\r\n',
    })

    manager.dispose()
  })
})
