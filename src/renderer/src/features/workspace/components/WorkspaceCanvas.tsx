import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import { resolveAgentModel, type AgentSettings } from '../../settings/agentConfig'
import { TerminalNode } from './TerminalNode'
import type { Point, Size, TerminalNodeData } from '../types'
import {
  clampSizeToNonOverlapping,
  findNearestFreePosition,
  isPositionAvailable,
} from '../utils/collision'

interface WorkspaceCanvasProps {
  workspacePath: string
  nodes: Node<TerminalNodeData>[]
  onNodesChange: (nodes: Node<TerminalNodeData>[]) => void
  agentSettings: AgentSettings
}

interface ContextMenuState {
  x: number
  y: number
  flowX: number
  flowY: number
}

interface AgentLauncherState {
  anchor: Point
  prompt: string
  isLaunching: boolean
  error: string | null
}

const DEFAULT_SIZE: Size = {
  width: 460,
  height: 300,
}

const MIN_SIZE: Size = {
  width: 320,
  height: 220,
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.length > 0) {
    return error
  }

  return 'Unknown error'
}

function WorkspaceCanvasInner({
  workspacePath,
  nodes,
  onNodesChange,
  agentSettings,
}: WorkspaceCanvasProps): JSX.Element {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [agentLauncher, setAgentLauncher] = useState<AgentLauncherState | null>(null)

  const reactFlow = useReactFlow<TerminalNodeData>()

  const closeNodeRef = useRef<(nodeId: string) => Promise<void>>(async () => undefined)
  const resizeNodeRef = useRef<(nodeId: string, desiredSize: Size) => void>(() => undefined)

  const upsertNode = useCallback(
    (nextNode: Node<TerminalNodeData>) => {
      onNodesChange(nodes.map(node => (node.id === nextNode.id ? nextNode : node)))
    },
    [nodes, onNodesChange],
  )

  const closeNode = useCallback(
    async (nodeId: string) => {
      const target = nodes.find(node => node.id === nodeId)
      if (target) {
        await window.coveApi.pty.kill({ sessionId: target.data.sessionId })
      }

      const next = nodes.filter(node => node.id !== nodeId)
      onNodesChange(next)
    },
    [nodes, onNodesChange],
  )

  const normalizePosition = useCallback(
    (nodeId: string, desired: Point, size: Size): Point => {
      return findNearestFreePosition(desired, size, nodes, nodeId)
    },
    [nodes],
  )

  const resizeNode = useCallback(
    (nodeId: string, desiredSize: Size) => {
      const node = nodes.find(item => item.id === nodeId)
      if (!node) {
        return
      }

      const boundedSize = clampSizeToNonOverlapping(
        node.position,
        desiredSize,
        MIN_SIZE,
        nodes,
        nodeId,
      )

      upsertNode({
        ...node,
        data: {
          ...node.data,
          width: boundedSize.width,
          height: boundedSize.height,
        },
      })
    },
    [nodes, upsertNode],
  )

  useEffect(() => {
    closeNodeRef.current = closeNode
  }, [closeNode])

  useEffect(() => {
    resizeNodeRef.current = resizeNode
  }, [resizeNode])

  const nodeTypes = useMemo(
    () => ({
      terminalNode: ({ data, id }: { data: TerminalNodeData; id: string }) => (
        <TerminalNode
          sessionId={data.sessionId}
          title={data.title}
          width={data.width}
          height={data.height}
          onClose={() => {
            void closeNodeRef.current(id)
          }}
          onResize={size => resizeNodeRef.current(id, size)}
        />
      ),
    }),
    [],
  )

  const handlePaneContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      const flowPosition = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        flowX: flowPosition.x,
        flowY: flowPosition.y,
      })
    },
    [reactFlow],
  )

  const createNodeForSession = useCallback(
    async (sessionId: string, title: string, anchor: Point): Promise<boolean> => {
      const nonOverlappingPosition = findNearestFreePosition(anchor, DEFAULT_SIZE, nodes)
      const canPlace = isPositionAvailable(nonOverlappingPosition, DEFAULT_SIZE, nodes)

      if (!canPlace) {
        await window.coveApi.pty.kill({ sessionId })
        window.alert('当前视图附近没有可用空位，请先移动或关闭部分终端窗口。')
        return false
      }

      const nextNode: Node<TerminalNodeData> = {
        id: crypto.randomUUID(),
        type: 'terminalNode',
        position: nonOverlappingPosition,
        data: {
          sessionId,
          title,
          width: DEFAULT_SIZE.width,
          height: DEFAULT_SIZE.height,
        },
        draggable: true,
        selectable: true,
      }

      onNodesChange([...nodes, nextNode])
      return true
    },
    [nodes, onNodesChange],
  )

  const createTerminalNode = useCallback(async () => {
    if (!contextMenu) {
      return
    }

    const anchor: Point = {
      x: contextMenu.flowX,
      y: contextMenu.flowY,
    }

    setContextMenu(null)

    const spawned = await window.coveApi.pty.spawn({
      cwd: workspacePath,
      cols: 80,
      rows: 24,
    })

    await createNodeForSession(spawned.sessionId, `terminal-${nodes.length + 1}`, anchor)
  }, [contextMenu, createNodeForSession, nodes.length, workspacePath])

  const openAgentLauncher = useCallback(() => {
    if (!contextMenu) {
      return
    }

    const anchor: Point = {
      x: contextMenu.flowX,
      y: contextMenu.flowY,
    }

    setContextMenu(null)
    setAgentLauncher({
      anchor,
      prompt: '',
      isLaunching: false,
      error: null,
    })
  }, [contextMenu])

  const closeAgentLauncher = useCallback(() => {
    setAgentLauncher(prev => {
      if (!prev || prev.isLaunching) {
        return prev
      }

      return null
    })
  }, [])

  const launchDefaultAgentNode = useCallback(async () => {
    if (!agentLauncher) {
      return
    }

    const normalizedPrompt = agentLauncher.prompt.trim()
    if (normalizedPrompt.length === 0) {
      setAgentLauncher(prev =>
        prev
          ? {
              ...prev,
              error: '任务提示词不能为空。',
            }
          : prev,
      )
      return
    }

    setAgentLauncher(prev =>
      prev
        ? {
            ...prev,
            isLaunching: true,
            error: null,
          }
        : prev,
    )

    const provider = agentSettings.defaultProvider
    const model = resolveAgentModel(agentSettings, provider)

    try {
      const launched = await window.coveApi.agent.launch({
        provider,
        cwd: workspacePath,
        prompt: normalizedPrompt,
        model,
        cols: 80,
        rows: 24,
      })

      const titleParts = [provider === 'codex' ? 'codex' : 'claude']
      titleParts.push(launched.effectiveModel ?? 'default-model')

      const created = await createNodeForSession(
        launched.sessionId,
        titleParts.join(' · '),
        agentLauncher.anchor,
      )

      if (!created) {
        setAgentLauncher(prev =>
          prev
            ? {
                ...prev,
                isLaunching: false,
                error: '终端窗口无法放置，请先整理画布后重试。',
              }
            : prev,
        )
        return
      }

      setAgentLauncher(null)
    } catch (error) {
      setAgentLauncher(prev =>
        prev
          ? {
              ...prev,
              isLaunching: false,
              error: `Agent 启动失败：${toErrorMessage(error)}`,
            }
          : prev,
      )
    }
  }, [agentLauncher, agentSettings, createNodeForSession, workspacePath])

  const applyChanges = useCallback(
    (changes: NodeChange<TerminalNodeData>[]) => {
      if (!changes.length) {
        return
      }

      const removedIds = new Set(
        changes.filter(change => change.type === 'remove').map(change => change.id),
      )

      if (removedIds.size > 0) {
        nodes.forEach(node => {
          if (!removedIds.has(node.id)) {
            return
          }

          void window.coveApi.pty.kill({ sessionId: node.data.sessionId })
        })
      }

      const survivingNodes = nodes.filter(node => !removedIds.has(node.id))
      const nonRemoveChanges = changes.filter(change => change.type !== 'remove')

      let nextNodes = applyNodeChanges(nonRemoveChanges, survivingNodes)

      const settledPositionChanges = changes.filter(
        change =>
          change.type === 'position' &&
          !change.dragging &&
          change.position !== undefined &&
          !removedIds.has(change.id),
      )

      if (settledPositionChanges.length > 0) {
        nextNodes = nextNodes.map(node => {
          const settledChange = settledPositionChanges.find(change => change.id === node.id)
          if (!settledChange || !settledChange.position) {
            return node
          }

          const resolved = normalizePosition(node.id, settledChange.position, {
            width: node.data.width,
            height: node.data.height,
          })

          return {
            ...node,
            position: resolved,
          }
        })
      }

      onNodesChange(nextNodes)
    },
    [nodes, normalizePosition, onNodesChange],
  )

  const activeProviderLabel = agentSettings.defaultProvider === 'codex' ? 'Codex' : 'Claude Code'
  const activeModelLabel =
    resolveAgentModel(agentSettings, agentSettings.defaultProvider) ?? 'Default'

  return (
    <div className="workspace-canvas" onClick={() => setContextMenu(null)}>
      <ReactFlow<TerminalNodeData>
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        onNodesChange={applyChanges}
        onPaneContextMenu={handlePaneContextMenu}
        nodesDraggable
        elementsSelectable
        zoomOnScroll
        panOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick
        fitView
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} size={1} gap={24} color="#20324f" />
        <MiniMap
          pannable
          zoomable
          style={{
            background: 'rgba(7, 12, 24, 0.8)',
            border: '1px solid rgba(83, 124, 255, 0.35)',
          }}
        />
        <Controls />
      </ReactFlow>

      {contextMenu ? (
        <div
          className="workspace-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={event => {
            event.stopPropagation()
          }}
        >
          <button
            type="button"
            data-testid="workspace-context-new-terminal"
            onClick={() => {
              void createTerminalNode()
            }}
          >
            New Terminal
          </button>
          <button
            type="button"
            data-testid="workspace-context-run-default-agent"
            onClick={() => {
              openAgentLauncher()
            }}
          >
            Run Default Agent
          </button>
        </div>
      ) : null}

      {agentLauncher ? (
        <div
          className="workspace-agent-launcher-backdrop"
          onClick={() => {
            closeAgentLauncher()
          }}
        >
          <section
            className="workspace-agent-launcher"
            data-testid="workspace-agent-launcher"
            onClick={event => {
              event.stopPropagation()
            }}
          >
            <h3>Run Default Agent</h3>
            <p className="workspace-agent-launcher__meta">
              Provider: {activeProviderLabel} · Model: {activeModelLabel}
            </p>
            <textarea
              data-testid="workspace-agent-launch-prompt"
              placeholder="输入任务提示词..."
              value={agentLauncher.prompt}
              disabled={agentLauncher.isLaunching}
              onChange={event => {
                const nextPrompt = event.target.value
                setAgentLauncher(prev =>
                  prev
                    ? {
                        ...prev,
                        prompt: nextPrompt,
                        error: null,
                      }
                    : prev,
                )
              }}
            />

            {agentLauncher.error ? (
              <p className="workspace-agent-launcher__error">{agentLauncher.error}</p>
            ) : null}

            <div className="workspace-agent-launcher__actions">
              <button
                type="button"
                data-testid="workspace-agent-launch-cancel"
                disabled={agentLauncher.isLaunching}
                onClick={() => {
                  closeAgentLauncher()
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="workspace-agent-launch-submit"
                disabled={agentLauncher.isLaunching}
                onClick={() => {
                  void launchDefaultAgentNode()
                }}
              >
                {agentLauncher.isLaunching ? 'Launching...' : 'Run'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

export function WorkspaceCanvas(props: WorkspaceCanvasProps): JSX.Element {
  return (
    <ReactFlowProvider>
      <WorkspaceCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
