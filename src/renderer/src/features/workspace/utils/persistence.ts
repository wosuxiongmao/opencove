import {
  DEFAULT_AGENT_SETTINGS,
  normalizeAgentSettings,
  type AgentSettings,
} from '../../settings/agentConfig'
import type {
  PersistedAppState,
  PersistedWorkspaceState,
  WorkspaceState,
  PersistedTerminalNode,
} from '../types'

const STORAGE_KEY = 'cove:m0:workspace-state'

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage ?? null
}

function ensurePersistedNode(node: unknown): PersistedTerminalNode | null {
  if (!node || typeof node !== 'object') {
    return null
  }

  const record = node as Record<string, unknown>
  const id = record.id
  const title = record.title
  const width = record.width
  const height = record.height
  const position = record.position

  if (
    typeof id !== 'string' ||
    typeof title !== 'string' ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !position ||
    typeof position !== 'object'
  ) {
    return null
  }

  const positionRecord = position as Record<string, unknown>
  if (typeof positionRecord.x !== 'number' || typeof positionRecord.y !== 'number') {
    return null
  }

  return {
    id,
    title,
    width,
    height,
    position: {
      x: positionRecord.x,
      y: positionRecord.y,
    },
  }
}

function ensurePersistedWorkspace(workspace: unknown): PersistedWorkspaceState | null {
  if (!workspace || typeof workspace !== 'object') {
    return null
  }

  const record = workspace as Record<string, unknown>
  const id = record.id
  const name = record.name
  const path = record.path
  const nodes = record.nodes

  if (typeof id !== 'string' || typeof name !== 'string' || typeof path !== 'string') {
    return null
  }

  if (!Array.isArray(nodes)) {
    return null
  }

  const normalizedNodes = nodes
    .map(node => ensurePersistedNode(node))
    .filter((node): node is PersistedTerminalNode => node !== null)

  return {
    id,
    name,
    path,
    nodes: normalizedNodes,
  }
}

export function readPersistedState(): PersistedAppState | null {
  const storage = getStorage()
  if (!storage) {
    return null
  }

  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return null
    }

    const record = parsed as Record<string, unknown>
    const activeWorkspaceId = record.activeWorkspaceId
    const workspaces = record.workspaces

    if (activeWorkspaceId !== null && typeof activeWorkspaceId !== 'string') {
      return null
    }

    if (!Array.isArray(workspaces)) {
      return null
    }

    const normalizedWorkspaces = workspaces
      .map(item => ensurePersistedWorkspace(item))
      .filter((item): item is PersistedWorkspaceState => item !== null)

    const settings = normalizeAgentSettings(record.settings)

    return {
      activeWorkspaceId,
      workspaces: normalizedWorkspaces,
      settings,
    }
  } catch {
    return null
  }
}

export function writePersistedState(state: PersistedAppState): void {
  const storage = getStorage()
  if (!storage) {
    return
  }

  storage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function writeRawPersistedState(raw: string): void {
  const storage = getStorage()
  if (!storage) {
    return
  }

  storage.setItem(STORAGE_KEY, raw)
}

export function toPersistedState(
  workspaces: WorkspaceState[],
  activeWorkspaceId: string | null,
  settings: AgentSettings = DEFAULT_AGENT_SETTINGS,
): PersistedAppState {
  return {
    activeWorkspaceId,
    workspaces: workspaces.map(workspace => ({
      id: workspace.id,
      name: workspace.name,
      path: workspace.path,
      nodes: workspace.nodes.map(node => ({
        id: node.id,
        title: node.data.title,
        position: node.position,
        width: node.data.width,
        height: node.data.height,
      })),
    })),
    settings,
  }
}
