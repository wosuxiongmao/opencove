import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { Node, ReactFlowInstance } from '@xyflow/react'
import type { TerminalNodeData } from '../../../types'
import type { SelectionDraftState } from '../types'
import type { Rect } from './useSpaceOwnership.helpers'

export function resolveSelectionDraftRect(
  reactFlow: ReactFlowInstance<Node<TerminalNodeData>>,
  draft: SelectionDraftState,
): Rect {
  const start = reactFlow.screenToFlowPosition({
    x: draft.startX,
    y: draft.startY,
  })
  const end = reactFlow.screenToFlowPosition({
    x: draft.currentX,
    y: draft.currentY,
  })

  const left = Math.min(start.x, end.x)
  const right = Math.max(start.x, end.x)
  const top = Math.min(start.y, end.y)
  const bottom = Math.max(start.y, end.y)

  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  }
}

export function setSortedSelectedSpaceIds(
  next: string[],
  selectedSpaceIdsRef: MutableRefObject<string[]>,
  setSelectedSpaceIds: Dispatch<SetStateAction<string[]>>,
): void {
  const sorted = [...new Set(next)].sort((a, b) => a.localeCompare(b))
  selectedSpaceIdsRef.current = sorted

  setSelectedSpaceIds(prev => {
    if (prev.length === sorted.length && prev.every((value, index) => value === sorted[index])) {
      return prev
    }

    return sorted
  })
}
