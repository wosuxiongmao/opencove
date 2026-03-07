import { useCallback } from 'react'
import type { SpaceWorktreeGuardState } from './SpaceWorktreeGuardWindow'
import type {
  BlockingNodesSnapshot,
  PendingOperation,
  UpdateSpaceDirectoryOptions,
} from './spaceWorktree.shared'
import { toErrorMessage } from '../helpers'

export function useSpaceWorktreeGuardActions({
  guard,
  setGuard,
  getBlockingNodes,
  closeNodesById,
  executePendingOperation,
  onClose,
}: {
  guard: (SpaceWorktreeGuardState & { pending: PendingOperation; spaceId: string }) | null
  setGuard: React.Dispatch<
    React.SetStateAction<
      (SpaceWorktreeGuardState & { pending: PendingOperation; spaceId: string }) | null
    >
  >
  getBlockingNodes: (spaceId: string) => BlockingNodesSnapshot
  closeNodesById: (nodeIds: string[]) => Promise<void>
  executePendingOperation: (
    targetSpaceId: string,
    pending: PendingOperation,
    options?: UpdateSpaceDirectoryOptions,
  ) => Promise<void>
  onClose: () => void
}): {
  applyPendingWithMismatch: () => Promise<void>
  applyPendingByClosingAll: () => Promise<void>
} {
  const applyPendingWithMismatch = useCallback(async () => {
    if (!guard) {
      return
    }

    if (!guard.allowMarkMismatch) {
      setGuard(previous =>
        previous
          ? {
              ...previous,
              error: 'This action requires closing all windows first.',
            }
          : previous,
      )
      return
    }

    setGuard(previous => (previous ? { ...previous, isBusy: true, error: null } : previous))

    try {
      await executePendingOperation(guard.spaceId, guard.pending, {
        markNodeDirectoryMismatch: true,
      })
      setGuard(null)
      if (guard.pending.kind === 'create' || guard.pending.kind === 'archive') {
        onClose()
      }
    } catch (operationError) {
      setGuard(previous =>
        previous
          ? {
              ...previous,
              isBusy: false,
              error: toErrorMessage(operationError),
            }
          : previous,
      )
    }
  }, [executePendingOperation, guard, onClose, setGuard])

  const applyPendingByClosingAll = useCallback(async () => {
    if (!guard) {
      return
    }

    const blocking = getBlockingNodes(guard.spaceId)
    const nodesToClose = [...new Set([...blocking.agentNodeIds, ...blocking.terminalNodeIds])]

    setGuard(previous => (previous ? { ...previous, isBusy: true, error: null } : previous))

    try {
      if (nodesToClose.length > 0) {
        await closeNodesById(nodesToClose)
      }

      const nextBlocking = getBlockingNodes(guard.spaceId)
      if (nextBlocking.agentNodeIds.length > 0 || nextBlocking.terminalNodeIds.length > 0) {
        setGuard(previous =>
          previous
            ? {
                ...previous,
                isBusy: false,
                agentCount: nextBlocking.agentNodeIds.length,
                terminalCount: nextBlocking.terminalNodeIds.length,
                error: 'Some windows could not be closed. Close them manually and try again.',
              }
            : previous,
        )
        return
      }

      await executePendingOperation(guard.spaceId, guard.pending)
      setGuard(null)
      if (guard.pending.kind === 'create' || guard.pending.kind === 'archive') {
        onClose()
      }
    } catch (operationError) {
      setGuard(previous =>
        previous
          ? {
              ...previous,
              isBusy: false,
              error: toErrorMessage(operationError),
            }
          : previous,
      )
    }
  }, [closeNodesById, executePendingOperation, getBlockingNodes, guard, onClose, setGuard])

  return {
    applyPendingWithMismatch,
    applyPendingByClosingAll,
  }
}
