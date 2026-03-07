import { useMemo, type MutableRefObject } from 'react'
import type { Node, Viewport } from '@xyflow/react'
import {
  AGENT_PROVIDER_LABEL,
  resolveTaskTitleModel,
  resolveTaskTitleProvider,
  type AgentSettings,
} from '../../../../settings/agentConfig'
import type { TerminalNodeData, WorkspaceSpaceState } from '../../../types'
import { useWorkspaceCanvasTaskAgentEdges } from './useTaskAgentEdges'
import { useWorkspaceCanvasTaskAssignerOptions } from './useTaskAssignerOptions'
import { useWorkspaceCanvasViewportMoveEnd } from './useViewportMoveEnd'
import { useWorkspaceCanvasSpaceUi } from './useSpaceUi'
import { resolveWorkspaceMinimapNodeColor } from '../minimap'
import type { ContextMenuState, EmptySelectionPromptState, TaskAssignerState } from '../types'

export function useWorkspaceCanvasViewModel({
  agentSettings,
  viewportRef,
  onViewportChange,
  flowNodes,
  taskAssigner,
  contextMenu,
  setContextMenu,
  setEmptySelectionPrompt,
  cancelSpaceRename,
  workspacePath,
  spacesRef,
  handlePaneClick,
  handlePaneContextMenu,
  handleNodeContextMenu,
  handleSelectionContextMenu,
}: {
  agentSettings: AgentSettings
  viewportRef: MutableRefObject<Viewport>
  onViewportChange: (viewport: Viewport) => void
  flowNodes: Node<TerminalNodeData>[]
  taskAssigner: TaskAssignerState | null
  contextMenu: ContextMenuState | null
  setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState | null>>
  setEmptySelectionPrompt: React.Dispatch<React.SetStateAction<EmptySelectionPromptState | null>>
  cancelSpaceRename: () => void
  workspacePath: string
  spacesRef: MutableRefObject<WorkspaceSpaceState[]>
  handlePaneClick: (event: React.MouseEvent | MouseEvent) => void
  handlePaneContextMenu: (event: React.MouseEvent | MouseEvent) => void
  handleNodeContextMenu: (event: React.MouseEvent, node: Node<TerminalNodeData>) => void
  handleSelectionContextMenu: (
    event: React.MouseEvent,
    selectedNodes: Node<TerminalNodeData>[],
  ) => void
}): {
  taskTitleProviderLabel: string
  taskTitleModelLabel: string
  handleViewportMoveEnd: (_event: MouseEvent | TouchEvent | null, nextViewport: Viewport) => void
  minimapNodeColor: typeof resolveWorkspaceMinimapNodeColor
  taskAssignerAgentOptions: Array<{
    nodeId: string
    title: string
    status: TerminalNodeData['status']
    linkedTaskTitle: string | null
  }>
  activeTaskForAssigner: Node<TerminalNodeData> | null
  taskAgentEdges: ReturnType<typeof useWorkspaceCanvasTaskAgentEdges>
  spaceUi: ReturnType<typeof useWorkspaceCanvasSpaceUi>
} {
  const taskTitleProviderLabel = AGENT_PROVIDER_LABEL[resolveTaskTitleProvider(agentSettings)]
  const taskTitleModelLabel = resolveTaskTitleModel(agentSettings) ?? 'default model'
  const handleViewportMoveEnd = useWorkspaceCanvasViewportMoveEnd({ viewportRef, onViewportChange })
  const minimapNodeColor = resolveWorkspaceMinimapNodeColor

  const { taskAssignerAgentOptions, activeTaskForAssigner } = useWorkspaceCanvasTaskAssignerOptions(
    {
      nodes: flowNodes,
      taskAssigner,
    },
  )

  const taskAgentEdges = useWorkspaceCanvasTaskAgentEdges(flowNodes)

  const spaceUi = useWorkspaceCanvasSpaceUi({
    contextMenu,
    setContextMenu,
    setEmptySelectionPrompt,
    cancelSpaceRename,
    workspacePath,
    spacesRef,
    handlePaneClick,
    handlePaneContextMenu,
    handleNodeContextMenu,
    handleSelectionContextMenu,
  })

  return useMemo(
    () => ({
      taskTitleProviderLabel,
      taskTitleModelLabel,
      handleViewportMoveEnd,
      minimapNodeColor,
      taskAssignerAgentOptions,
      activeTaskForAssigner,
      taskAgentEdges,
      spaceUi,
    }),
    [
      activeTaskForAssigner,
      handleViewportMoveEnd,
      minimapNodeColor,
      spaceUi,
      taskAgentEdges,
      taskAssignerAgentOptions,
      taskTitleModelLabel,
      taskTitleProviderLabel,
    ],
  )
}
