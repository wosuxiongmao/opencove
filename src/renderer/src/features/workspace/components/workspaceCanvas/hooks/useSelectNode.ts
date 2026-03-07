import { useCallback } from 'react'
import { useStoreApi, type Node } from '@xyflow/react'
import type { TerminalNodeData } from '../../../types'

type SetNodes = (
  updater: (prevNodes: Node<TerminalNodeData>[]) => Node<TerminalNodeData>[],
  options?: { syncLayout?: boolean },
) => void

export function useWorkspaceCanvasSelectNode({
  setNodes,
  setSelectedNodeIds,
  setSelectedSpaceIds,
  selectedNodeIdsRef,
  selectedSpaceIdsRef,
}: {
  setNodes: SetNodes
  setSelectedNodeIds: React.Dispatch<React.SetStateAction<string[]>>
  setSelectedSpaceIds: React.Dispatch<React.SetStateAction<string[]>>
  selectedNodeIdsRef: React.MutableRefObject<string[]>
  selectedSpaceIdsRef: React.MutableRefObject<string[]>
}): (nodeId: string) => void {
  const reactFlowStore = useStoreApi()

  return useCallback(
    (nodeId: string) => {
      reactFlowStore.setState({ nodesSelectionActive: false })

      const shouldPreserveSelectedSpaces =
        selectedSpaceIdsRef.current.length > 0 && selectedNodeIdsRef.current.includes(nodeId)

      let didUpdateSelection = false
      setNodes(
        prevNodes => {
          const isAlreadySelected = prevNodes.some(node => node.id === nodeId && node.selected)
          if (isAlreadySelected) {
            return prevNodes
          }

          didUpdateSelection = true
          let hasChanged = false
          const nextNodes = prevNodes.map(node => {
            const shouldSelect = node.id === nodeId
            if (node.selected === shouldSelect) {
              return node
            }

            hasChanged = true
            return {
              ...node,
              selected: shouldSelect,
            }
          })

          return hasChanged ? nextNodes : prevNodes
        },
        { syncLayout: false },
      )

      if (!didUpdateSelection) {
        return
      }

      if (!shouldPreserveSelectedSpaces) {
        setSelectedSpaceIds([])
      }
      setSelectedNodeIds(previous => {
        if (previous.includes(nodeId)) {
          return previous
        }

        return [nodeId]
      })
    },
    [
      reactFlowStore,
      selectedNodeIdsRef,
      selectedSpaceIdsRef,
      setNodes,
      setSelectedNodeIds,
      setSelectedSpaceIds,
    ],
  )
}
