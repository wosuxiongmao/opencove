import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'
import { useStoreApi, type Node, type ReactFlowInstance } from '@xyflow/react'
import type { TerminalNodeData, WorkspaceSpaceState } from '../../../types'
import type { ContextMenuState, EmptySelectionPromptState, SelectionDraftState } from '../types'
import { isPointInsideRect, rectIntersects, type Rect } from './useSpaceOwnership.helpers'
import { resolveSelectionDraftRect, setSortedSelectedSpaceIds } from './useSelectionDraft.helpers'

interface UseSelectionDraftParams {
  isTrackpadCanvasMode: boolean
  isShiftPressedRef: MutableRefObject<boolean>
  selectionDraftRef: MutableRefObject<SelectionDraftState | null>
  reactFlow: ReactFlowInstance<Node<TerminalNodeData>>
  spacesRef: MutableRefObject<WorkspaceSpaceState[]>
  selectedNodeIdsRef: MutableRefObject<string[]>
  selectedSpaceIdsRef: MutableRefObject<string[]>
  setNodes: (
    updater: (prevNodes: Node<TerminalNodeData>[]) => Node<TerminalNodeData>[],
    options?: { syncLayout?: boolean },
  ) => void
  setSelectedNodeIds: React.Dispatch<React.SetStateAction<string[]>>
  setSelectedSpaceIds: React.Dispatch<React.SetStateAction<string[]>>
  setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState | null>>
  setEmptySelectionPrompt: React.Dispatch<React.SetStateAction<EmptySelectionPromptState | null>>
}

export function useWorkspaceCanvasSelectionDraft({
  isTrackpadCanvasMode,
  isShiftPressedRef,
  selectionDraftRef,
  reactFlow,
  spacesRef,
  selectedNodeIdsRef,
  selectedSpaceIdsRef,
  setNodes,
  setSelectedNodeIds,
  setSelectedSpaceIds,
  setContextMenu,
  setEmptySelectionPrompt,
}: UseSelectionDraftParams): {
  handleCanvasPointerDownCapture: (event: React.PointerEvent<HTMLDivElement>) => void
  handleCanvasPointerMoveCapture: (event: React.PointerEvent<HTMLDivElement>) => void
  handleCanvasPointerUpCapture: (event?: { clientX: number; clientY: number }) => boolean
} {
  const pendingSelectionFrameRef = useRef<number | null>(null)
  const removeGlobalPointerListenersRef = useRef<(() => void) | null>(null)
  const reactFlowStore = useStoreApi()

  const applyDraftSelection = useCallback(
    (draft: SelectionDraftState, options?: { forceDeselectIntersectingNodes?: boolean }) => {
      const forceDeselectIntersectingNodes = options?.forceDeselectIntersectingNodes === true
      const draftRect = resolveSelectionDraftRect(reactFlow, draft)

      const selectionIsInSpace = Boolean(draft.startSpaceId)
      const spaceAtStart = selectionIsInSpace
        ? (spacesRef.current.find(space => space.id === draft.startSpaceId) ?? null)
        : null
      const startSpaceRect = spaceAtStart?.rect ?? null

      const intersectingSpaces = selectionIsInSpace
        ? []
        : spacesRef.current
            .map(space => {
              if (!space.rect) {
                return null
              }

              if (!rectIntersects(space.rect as Rect, draftRect)) {
                return null
              }

              return { id: space.id, rect: space.rect }
            })
            .filter(
              (
                item,
              ): item is {
                id: string
                rect: NonNullable<WorkspaceSpaceState['rect']>
              } => item !== null,
            )

      const intersectingSpaceIds = intersectingSpaces.map(space => space.id)
      const intersectingSpaceRects = intersectingSpaces.map(space => space.rect)

      const nextSelectedSpaceIds = selectionIsInSpace
        ? []
        : draft.additive
          ? [...draft.selectedSpaceIdsAtStart, ...intersectingSpaceIds]
          : intersectingSpaceIds

      setSortedSelectedSpaceIds(nextSelectedSpaceIds, selectedSpaceIdsRef, setSelectedSpaceIds)

      const selectedAtStart = draft.additive
        ? new Set(draft.selectedNodeIdsAtStart)
        : new Set<string>()

      const selectedIds: string[] = []

      setNodes(
        previousNodes => {
          let hasChanged = false

          const nextNodes = previousNodes.map(node => {
            const nodeRect: Rect = {
              x: node.position.x,
              y: node.position.y,
              width: node.data.width,
              height: node.data.height,
            }

            const nodeCenter = {
              x: node.position.x + node.data.width / 2,
              y: node.position.y + node.data.height / 2,
            }

            const intersects = rectIntersects(nodeRect, draftRect)

            const allowedBySpace = selectionIsInSpace
              ? Boolean(startSpaceRect && isPointInsideRect(nodeCenter, startSpaceRect))
              : !intersectingSpaceRects.some(rect => isPointInsideRect(nodeCenter, rect))

            let isSelected = intersects && allowedBySpace

            if (draft.additive) {
              isSelected = isSelected || (allowedBySpace && selectedAtStart.has(node.id))
            }

            if (isSelected) {
              selectedIds.push(node.id)
            }

            const shouldForceDeselectSync =
              forceDeselectIntersectingNodes && intersects && !allowedBySpace

            if (node.selected === isSelected && !shouldForceDeselectSync) {
              return node
            }

            hasChanged = true
            return {
              ...node,
              selected: isSelected,
            }
          })

          return hasChanged ? nextNodes : previousNodes
        },
        { syncLayout: false },
      )
      selectedNodeIdsRef.current = selectedIds
      setSelectedNodeIds(selectedIds)
    },
    [
      reactFlow,
      selectedNodeIdsRef,
      selectedSpaceIdsRef,
      setNodes,
      setSelectedNodeIds,
      setSelectedSpaceIds,
      spacesRef,
    ],
  )

  const detachGlobalPointerListeners = useCallback(() => {
    removeGlobalPointerListenersRef.current?.()
    removeGlobalPointerListenersRef.current = null
  }, [])

  const finalizeSelectionDraft = useCallback(
    (pointer?: { clientX: number; clientY: number }) => {
      const draft = selectionDraftRef.current
      if (!draft || draft.phase !== 'active') {
        return false
      }

      if (pointer) {
        draft.currentX = pointer.clientX
        draft.currentY = pointer.clientY
      }

      detachGlobalPointerListeners()

      if (pendingSelectionFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingSelectionFrameRef.current)
        pendingSelectionFrameRef.current = null
      }

      const width = Math.abs(draft.currentX - draft.startX)
      const height = Math.abs(draft.currentY - draft.startY)
      if (width < 8 || height < 8) {
        selectionDraftRef.current = null

        const shouldClearSelection =
          !draft.additive &&
          draft.startSpaceId === null &&
          (draft.selectedNodeIdsAtStart.length > 0 || draft.selectedSpaceIdsAtStart.length > 0)

        if (shouldClearSelection) {
          setNodes(
            prevNodes => {
              let hasChanged = false
              const nextNodes = prevNodes.map(node => {
                if (!node.selected) {
                  return node
                }

                hasChanged = true
                return {
                  ...node,
                  selected: false,
                }
              })

              return hasChanged ? nextNodes : prevNodes
            },
            { syncLayout: false },
          )
          selectedNodeIdsRef.current = []
          setSelectedNodeIds([])
          updateSelectedSpaceIds([])
          reactFlowStore.setState({ nodesSelectionActive: false })
        }

        return false
      }

      draft.phase = 'settling'
      applyDraftSelection(draft, { forceDeselectIntersectingNodes: true })
      reactFlowStore.setState({ nodesSelectionActive: selectedNodeIdsRef.current.length > 0 })
      setEmptySelectionPrompt(null)

      window.requestAnimationFrame(() => {
        if (selectionDraftRef.current === draft) {
          applyDraftSelection(draft, { forceDeselectIntersectingNodes: true })
        }

        window.requestAnimationFrame(() => {
          if (selectionDraftRef.current === draft) {
            selectionDraftRef.current = null
          }
        })
      })

      return true
    },
    [
      applyDraftSelection,
      detachGlobalPointerListeners,
      reactFlowStore,
      selectionDraftRef,
      selectedNodeIdsRef,
      setEmptySelectionPrompt,
      setNodes,
      setSelectedNodeIds,
    ],
  )

  const registerGlobalPointerListeners = useCallback(() => {
    if (removeGlobalPointerListenersRef.current) {
      return
    }

    const handleGlobalPointerUp = (event: PointerEvent) => {
      const draft = selectionDraftRef.current
      if (!draft || draft.phase !== 'active' || draft.pointerId !== event.pointerId) {
        return
      }

      finalizeSelectionDraft(event)
    }

    const handleGlobalPointerCancel = (event?: PointerEvent | Event) => {
      const draft = selectionDraftRef.current
      if (event instanceof PointerEvent && draft && draft.pointerId !== event.pointerId) {
        return
      }

      detachGlobalPointerListeners()

      if (pendingSelectionFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingSelectionFrameRef.current)
        pendingSelectionFrameRef.current = null
      }

      if (selectionDraftRef.current?.phase === 'active') {
        selectionDraftRef.current = null
      }
    }

    window.addEventListener('pointerup', handleGlobalPointerUp, true)
    window.addEventListener('pointercancel', handleGlobalPointerCancel, true)
    window.addEventListener('blur', handleGlobalPointerCancel)

    removeGlobalPointerListenersRef.current = () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp, true)
      window.removeEventListener('pointercancel', handleGlobalPointerCancel, true)
      window.removeEventListener('blur', handleGlobalPointerCancel)
    }
  }, [detachGlobalPointerListeners, finalizeSelectionDraft, selectionDraftRef])

  useEffect(() => {
    return () => {
      detachGlobalPointerListeners()
      if (pendingSelectionFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingSelectionFrameRef.current)
        pendingSelectionFrameRef.current = null
      }
    }
  }, [detachGlobalPointerListeners])

  const handleCanvasPointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const canStartBoxSelection =
        isTrackpadCanvasMode || event.shiftKey || isShiftPressedRef.current

      if (event.button !== 0 || !canStartBoxSelection) {
        return
      }

      if (!(event.target instanceof Element)) {
        return
      }

      if (event.target.closest('.react-flow__node')) {
        return
      }

      if (event.target.closest('.react-flow__nodesselection-rect')) {
        return
      }

      if (event.target.closest('.workspace-space-region--selected')) {
        return
      }

      if (
        event.target.closest('.workspace-space-region__drag-handle') ||
        event.target.closest('.workspace-space-region__label-group') ||
        event.target.closest('.workspace-space-region__label-input') ||
        event.target.closest('.workspace-space-region__menu')
      ) {
        return
      }

      if (
        !event.target.closest('.react-flow__pane') &&
        !event.target.closest('.react-flow__renderer') &&
        !event.target.closest('.react-flow__background')
      ) {
        return
      }

      const startFlow = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const selectedNodes = reactFlow.getNodes().filter(node => node.selected)

      const pointerInsideSelectedNode = selectedNodes.some(node =>
        isPointInsideRect(startFlow, {
          x: node.position.x,
          y: node.position.y,
          width: node.data.width,
          height: node.data.height,
        }),
      )

      if (pointerInsideSelectedNode) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const startSpace = spacesRef.current.find(space => {
        if (!space.rect) {
          return false
        }

        const hitArea = {
          x: space.rect.x + 12,
          y: space.rect.y + 12,
          width: Math.max(0, space.rect.width - 24),
          height: Math.max(0, space.rect.height - 24),
        }

        return isPointInsideRect(startFlow, hitArea)
      })

      detachGlobalPointerListeners()
      selectionDraftRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        currentX: event.clientX,
        currentY: event.clientY,
        pointerId: event.pointerId,
        additive: event.shiftKey || isShiftPressedRef.current,
        selectedNodeIdsAtStart: selectedNodes.map(node => node.id),
        selectedSpaceIdsAtStart: [...selectedSpaceIdsRef.current],
        startSpaceId: startSpace?.id ?? null,
        phase: 'active',
      }
      registerGlobalPointerListeners()
      setContextMenu(null)
      setEmptySelectionPrompt(null)
    },
    [
      detachGlobalPointerListeners,
      isShiftPressedRef,
      isTrackpadCanvasMode,
      reactFlow,
      registerGlobalPointerListeners,
      selectedSpaceIdsRef,
      selectionDraftRef,
      spacesRef,
      setContextMenu,
      setEmptySelectionPrompt,
    ],
  )

  const scheduleDraftSelectionUpdate = useCallback(() => {
    if (pendingSelectionFrameRef.current !== null) {
      return
    }

    pendingSelectionFrameRef.current = window.requestAnimationFrame(() => {
      pendingSelectionFrameRef.current = null
      const latestDraft = selectionDraftRef.current
      if (!latestDraft || latestDraft.phase !== 'active') {
        return
      }

      const width = Math.abs(latestDraft.currentX - latestDraft.startX)
      const height = Math.abs(latestDraft.currentY - latestDraft.startY)
      if (width < 8 || height < 8) {
        return
      }

      applyDraftSelection(latestDraft)
    })
  }, [applyDraftSelection, selectionDraftRef])

  const handleCanvasPointerMoveCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const draft = selectionDraftRef.current
      if (!draft || draft.phase !== 'active') {
        return
      }

      if (event.buttons === 0) {
        finalizeSelectionDraft({ clientX: event.clientX, clientY: event.clientY })
        return
      }

      event.preventDefault()
      event.stopPropagation()

      draft.currentX = event.clientX
      draft.currentY = event.clientY
      scheduleDraftSelectionUpdate()
    },
    [finalizeSelectionDraft, scheduleDraftSelectionUpdate, selectionDraftRef],
  )

  const handleCanvasPointerUpCapture = useCallback(
    (event?: { clientX: number; clientY: number }) => finalizeSelectionDraft(event),
    [finalizeSelectionDraft],
  )

  return {
    handleCanvasPointerDownCapture,
    handleCanvasPointerMoveCapture,
    handleCanvasPointerUpCapture,
  }
}
