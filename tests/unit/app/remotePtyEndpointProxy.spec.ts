import { describe, expect, it, vi } from 'vitest'
import { RemotePtyEndpointProxy } from '../../../src/app/main/controlSurface/ptyStream/remotePtyEndpointProxy'
import type { WorkerTopologyStore } from '../../../src/app/main/controlSurface/topology/topologyStore'

describe('RemotePtyEndpointProxy', () => {
  function createProxy() {
    const emitData = vi.fn()
    const proxy = new RemotePtyEndpointProxy({
      endpointId: 'endpoint-1',
      topology: {
        resolveRemoteEndpointConnection: vi.fn(),
      } as unknown as WorkerTopologyStore,
      emitData,
      emitExit: vi.fn(),
      emitState: vi.fn(),
      emitMetadata: vi.fn(),
    })

    return {
      proxy,
      emitData,
      internals: proxy as unknown as {
        handleMessage: (raw: string) => void
        attachedSessions: Map<string, { lastSeq: number }>
      },
    }
  }

  it('does not advance replay cursor from attached acknowledgements', () => {
    const { internals, emitData } = createProxy()

    internals.handleMessage(JSON.stringify({ type: 'attached', sessionId: 'session-1', seq: 9 }))

    expect(internals.attachedSessions.get('session-1')?.lastSeq).toBe(0)

    internals.handleMessage(
      JSON.stringify({ type: 'data', sessionId: 'session-1', data: 'hello', seq: 9 }),
    )

    expect(internals.attachedSessions.get('session-1')?.lastSeq).toBe(9)
    expect(emitData).toHaveBeenCalledWith('session-1', 'hello')
  })
})
