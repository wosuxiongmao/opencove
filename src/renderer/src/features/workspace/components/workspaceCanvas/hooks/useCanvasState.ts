import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Node, Viewport } from '@xyflow/react'
import type { TerminalNodeData, WorkspaceSpaceState } from '../../../types'
import {
  createCanvasInputModalityState,
  type DetectedCanvasInputMode,
} from '../../../utils/inputModality'
import type {
  ContextMenuState,
  EmptySelectionPromptState,
  SelectionDraftState,
  TrackpadGestureLockState,
} from '../types'

export function useWorkspaceCanvasState({
  nodes,
  spaces,
  viewport,
  persistedMinimapVisible,
}: {
  nodes: Node<TerminalNodeData>[]
  spaces: WorkspaceSpaceState[]
  viewport: Viewport
  persistedMinimapVisible: boolean
}): {
  contextMenu: ContextMenuState | null
  setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState | null>>
  isMinimapVisible: boolean
  setIsMinimapVisible: React.Dispatch<React.SetStateAction<boolean>>
  selectedNodeIds: string[]
  setSelectedNodeIds: React.Dispatch<React.SetStateAction<string[]>>
  selectedSpaceIds: string[]
  setSelectedSpaceIds: React.Dispatch<React.SetStateAction<string[]>>
  setEmptySelectionPrompt: React.Dispatch<React.SetStateAction<EmptySelectionPromptState | null>>
  detectedCanvasInputMode: DetectedCanvasInputMode
  setDetectedCanvasInputMode: React.Dispatch<React.SetStateAction<DetectedCanvasInputMode>>
  isShiftPressed: boolean
  setIsShiftPressed: React.Dispatch<React.SetStateAction<boolean>>
  canvasRef: React.RefObject<HTMLDivElement>
  restoredViewportWorkspaceIdRef: React.MutableRefObject<string | null>
  spacesRef: React.MutableRefObject<WorkspaceSpaceState[]>
  selectedNodeIdsRef: React.MutableRefObject<string[]>
  selectedSpaceIdsRef: React.MutableRefObject<string[]>
  dragSelectedSpaceIdsRef: React.MutableRefObject<string[] | null>
  selectionDraftRef: React.MutableRefObject<SelectionDraftState | null>
  inputModalityStateRef: React.MutableRefObject<ReturnType<typeof createCanvasInputModalityState>>
  isShiftPressedRef: React.MutableRefObject<boolean>
  trackpadGestureLockRef: React.MutableRefObject<TrackpadGestureLockState | null>
  viewportRef: React.MutableRefObject<Viewport>
  flowNodes: Node<TerminalNodeData>[]
} {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [isMinimapVisible, setIsMinimapVisible] = useState(persistedMinimapVisible)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>([])
  const [, setEmptySelectionPrompt] = useState<EmptySelectionPromptState | null>(null)
  const [detectedCanvasInputMode, setDetectedCanvasInputMode] =
    useState<DetectedCanvasInputMode>('mouse')
  const [isShiftPressed, setIsShiftPressed] = useState(false)

  const canvasRef = useRef<HTMLDivElement | null>(null)
  const restoredViewportWorkspaceIdRef = useRef<string | null>(null)
  const spacesRef = useRef(spaces)
  const selectedNodeIdsRef = useRef<string[]>([])
  const selectedSpaceIdsRef = useRef<string[]>([])
  const dragSelectedSpaceIdsRef = useRef<string[] | null>(null)
  const selectionDraftRef = useRef<SelectionDraftState | null>(null)
  const inputModalityStateRef = useRef(createCanvasInputModalityState('mouse'))
  const isShiftPressedRef = useRef(false)
  const trackpadGestureLockRef = useRef<TrackpadGestureLockState | null>(null)
  const viewportRef = useRef<Viewport>(viewport)

  const flowNodes = useMemo(() => {
    return nodes.map(node => {
      if (node.data.kind === 'note') {
        return node
      }

      const dragHandle = '[data-node-drag-handle="true"]'
      if (node.dragHandle === dragHandle) {
        return node
      }

      return {
        ...node,
        dragHandle,
      }
    })
  }, [nodes])

  useLayoutEffect(() => {
    selectedNodeIdsRef.current = selectedNodeIds
  }, [selectedNodeIds])

  useLayoutEffect(() => {
    selectedSpaceIdsRef.current = selectedSpaceIds
  }, [selectedSpaceIds])

  return {
    contextMenu,
    setContextMenu,
    isMinimapVisible,
    setIsMinimapVisible,
    selectedNodeIds,
    setSelectedNodeIds,
    selectedSpaceIds,
    setSelectedSpaceIds,
    setEmptySelectionPrompt,
    detectedCanvasInputMode,
    setDetectedCanvasInputMode,
    isShiftPressed,
    setIsShiftPressed,
    canvasRef,
    restoredViewportWorkspaceIdRef,
    spacesRef,
    selectedNodeIdsRef,
    selectedSpaceIdsRef,
    dragSelectedSpaceIdsRef,
    selectionDraftRef,
    inputModalityStateRef,
    isShiftPressedRef,
    trackpadGestureLockRef,
    viewportRef,
    flowNodes,
  }
}
