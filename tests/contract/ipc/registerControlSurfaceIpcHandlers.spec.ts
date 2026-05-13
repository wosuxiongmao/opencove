import { afterEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../../src/shared/contracts/ipc'
import { invokeHandledIpc } from './ipcTestUtils'

function createIpcHarness() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel)
    }),
  }

  return { handlers, ipcMain }
}

describe('control surface IPC handlers', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('reports worker unavailable when no endpoint can be resolved', async () => {
    const { handlers, ipcMain } = createIpcHarness()
    const logAgentLaunchInfo = vi.fn()
    const logAgentLaunchError = vi.fn()

    vi.doMock('electron', () => ({
      app: { getPath: vi.fn(() => '/tmp/opencove-user-data') },
      ipcMain,
    }))
    vi.doMock('../../../src/app/main/diagnostics/agentLaunchRuntimeDiagnostics', () => ({
      describeAgentLaunchError: vi.fn(() => ({})),
      logAgentLaunchInfo,
      logAgentLaunchError,
    }))
    vi.doMock(
      '../../../src/app/main/controlSurface/remote/resolveControlSurfaceConnectionInfo',
      () => ({
        resolveControlSurfaceConnectionInfoFromUserData: vi.fn(async () => null),
      }),
    )
    vi.doMock('../../../src/app/main/controlSurface/remote/controlSurfaceHttpClient', () => ({
      invokeControlSurface: vi.fn(),
    }))

    const { registerControlSurfaceIpcHandlers } =
      await import('../../../src/app/main/ipc/registerControlSurfaceIpcHandlers')
    registerControlSurfaceIpcHandlers({ endpointResolver: async () => null })

    const handler = handlers.get(IPC_CHANNELS.controlSurfaceInvoke)
    await expect(
      invokeHandledIpc(handler, null, {
        kind: 'command',
        id: 'session.launchAgentInMount',
        payload: { mountId: 'mount-1' },
      }),
    ).rejects.toMatchObject({ code: 'worker.unavailable' })
    expect(logAgentLaunchInfo).toHaveBeenCalledWith(
      'control-surface-ipc-received',
      expect.any(String),
      expect.objectContaining({
        kind: 'command',
        requestId: 'session.launchAgentInMount',
      }),
    )
    expect(logAgentLaunchError).toHaveBeenCalledWith(
      'control-surface-ipc-no-endpoint',
      expect.any(String),
      expect.objectContaining({
        kind: 'command',
        requestId: 'session.launchAgentInMount',
      }),
    )
  })
})
