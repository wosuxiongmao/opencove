import { describe, expect, it } from 'vitest'
import type { PresentationSnapshotTerminalResult } from '../../../src/shared/contracts/dto'
import {
  attachAfterPresentationSnapshot,
  resolvePresentationSnapshotAttachAfterSeq,
} from '../../../src/contexts/workspace/presentation/renderer/components/terminalNode/presentationSnapshotReplayCursor'

function createSnapshot(
  serializedScreen: string,
  appliedSeq = 42,
): PresentationSnapshotTerminalResult {
  return {
    sessionId: 'session-1',
    epoch: 1,
    appliedSeq,
    presentationRevision: 3,
    cols: 120,
    rows: 40,
    bufferKind: 'normal',
    cursor: { x: 0, y: 0 },
    title: null,
    serializedScreen,
  }
}

describe('presentation snapshot replay cursor', () => {
  it('does not use an empty or control-only presentation snapshot as an attach cursor', () => {
    expect(resolvePresentationSnapshotAttachAfterSeq(null)).toBeNull()
    expect(
      resolvePresentationSnapshotAttachAfterSeq(createSnapshot('\u001b[2J\u001b[H')),
    ).toBeNull()
  })

  it('uses the applied sequence only when the snapshot has visible display content', () => {
    expect(
      resolvePresentationSnapshotAttachAfterSeq(createSnapshot('\u001b[2J\u001b[Hready')),
    ).toBe(42)
  })

  it('attaches without afterSeq when the worker snapshot is not a visible baseline', async () => {
    const attached: Array<{ sessionId: string; afterSeq?: number | null }> = []

    await attachAfterPresentationSnapshot({
      ptyApi: {
        attach: async payload => {
          attached.push(payload)
        },
      } as never,
      sessionId: 'session-1',
      presentationSnapshotPromise: Promise.resolve(createSnapshot('\u001b[I')),
    })

    expect(attached).toStrictEqual([{ sessionId: 'session-1' }])
  })
})
