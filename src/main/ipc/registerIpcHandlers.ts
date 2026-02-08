import { dialog, ipcMain, webContents } from 'electron'
import type { IPty } from 'node-pty'
import { basename, resolve } from 'node:path'
import { IPC_CHANNELS } from '../../shared/constants/ipc'
import type {
  AgentProviderId,
  KillTerminalInput,
  LaunchAgentInput,
  LaunchAgentResult,
  ListAgentModelsInput,
  ResizeTerminalInput,
  SpawnTerminalInput,
  TerminalDataEvent,
  TerminalExitEvent,
  WorkspaceDirectory,
  WriteTerminalInput,
} from '../../shared/types/api'
import { buildAgentLaunchCommand } from '../infrastructure/agent/AgentCommandFactory'
import { listAgentModels } from '../infrastructure/agent/AgentModelService'
import { PtyManager } from '../infrastructure/pty/PtyManager'

export interface IpcRegistrationDisposable {
  dispose: () => void
}

function normalizeProvider(value: unknown): AgentProviderId {
  if (value !== 'claude-code' && value !== 'codex') {
    throw new Error('Invalid provider')
  }

  return value
}

function normalizeListModelsPayload(payload: unknown): ListAgentModelsInput {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid provider for agent:list-models')
  }

  const record = payload as Record<string, unknown>

  return {
    provider: normalizeProvider(record.provider),
  }
}

function resolveAgentTestStub(
  provider: AgentProviderId,
  model: string | null,
): {
  command: string
  args: string[]
} | null {
  if (process.env.NODE_ENV !== 'test') {
    return null
  }

  if (process.platform === 'win32') {
    const message = `[cove-test-agent] ${provider} ${model ?? 'default-model'}`
    return {
      command: 'powershell.exe',
      args: ['-NoLogo', '-NoProfile', '-Command', `Write-Output "${message}"`],
    }
  }

  const shell = process.env.SHELL ?? '/bin/zsh'
  const message = `[cove-test-agent] ${provider} ${model ?? 'default-model'}`

  return {
    command: shell,
    args: ['-lc', `printf '%s\n' "${message}"`],
  }
}

function normalizeLaunchAgentPayload(payload: unknown): LaunchAgentInput {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload for agent:launch')
  }

  const record = payload as Record<string, unknown>
  const provider = normalizeProvider(record.provider)
  const cwd = typeof record.cwd === 'string' ? record.cwd.trim() : ''
  const prompt = typeof record.prompt === 'string' ? record.prompt.trim() : ''
  const model = typeof record.model === 'string' ? record.model.trim() : ''

  const cols =
    typeof record.cols === 'number' && Number.isFinite(record.cols) && record.cols > 0
      ? Math.floor(record.cols)
      : 80
  const rows =
    typeof record.rows === 'number' && Number.isFinite(record.rows) && record.rows > 0
      ? Math.floor(record.rows)
      : 24

  if (cwd.length === 0) {
    throw new Error('Invalid cwd for agent:launch')
  }

  if (prompt.length === 0) {
    throw new Error('Invalid prompt for agent:launch')
  }

  return {
    provider,
    cwd,
    prompt,
    model: model.length > 0 ? model : null,
    cols,
    rows,
  }
}

export function registerIpcHandlers(): IpcRegistrationDisposable {
  const ptyManager = new PtyManager()

  const wirePtySessionEvents = (sessionId: string, pty: IPty): void => {
    pty.onData(data => {
      webContents.getAllWebContents().forEach(content => {
        const eventPayload: TerminalDataEvent = { sessionId, data }
        content.send(IPC_CHANNELS.ptyData, eventPayload)
      })
    })

    pty.onExit(exit => {
      ptyManager.delete(sessionId)
      webContents.getAllWebContents().forEach(content => {
        const eventPayload: TerminalExitEvent = {
          sessionId,
          exitCode: exit.exitCode,
        }
        content.send(IPC_CHANNELS.ptyExit, eventPayload)
      })
    })
  }

  ipcMain.handle(
    IPC_CHANNELS.workspaceSelectDirectory,
    async (): Promise<WorkspaceDirectory | null> => {
      if (process.env.COVE_TEST_WORKSPACE) {
        const testWorkspacePath = resolve(process.env.COVE_TEST_WORKSPACE)
        return {
          id: crypto.randomUUID(),
          name: basename(testWorkspacePath),
          path: testWorkspacePath,
        }
      }

      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const workspacePath = result.filePaths[0]
      const pathChunks = workspacePath.split(/[\\/]/)
      const workspaceName = pathChunks[pathChunks.length - 1] || workspacePath

      return {
        id: crypto.randomUUID(),
        name: workspaceName,
        path: workspacePath,
      }
    },
  )

  ipcMain.handle(IPC_CHANNELS.ptySpawn, async (_event, payload: SpawnTerminalInput) => {
    const { sessionId, pty } = ptyManager.spawnSession(payload)
    wirePtySessionEvents(sessionId, pty)

    return { sessionId }
  })

  ipcMain.handle(IPC_CHANNELS.ptyWrite, async (_event, payload: WriteTerminalInput) => {
    ptyManager.write(payload.sessionId, payload.data)
  })

  ipcMain.handle(IPC_CHANNELS.ptyResize, async (_event, payload: ResizeTerminalInput) => {
    ptyManager.resize(payload.sessionId, payload.cols, payload.rows)
  })

  ipcMain.handle(IPC_CHANNELS.ptyKill, async (_event, payload: KillTerminalInput) => {
    ptyManager.kill(payload.sessionId)
  })

  ipcMain.handle(IPC_CHANNELS.agentListModels, async (_event, payload: ListAgentModelsInput) => {
    const normalized = normalizeListModelsPayload(payload)
    return await listAgentModels(normalized.provider)
  })

  ipcMain.handle(IPC_CHANNELS.agentLaunch, async (_event, payload: LaunchAgentInput) => {
    const normalized = normalizeLaunchAgentPayload(payload)

    const launchCommand = buildAgentLaunchCommand({
      provider: normalized.provider,
      prompt: normalized.prompt,
      model: normalized.model ?? null,
    })

    const testStub = resolveAgentTestStub(normalized.provider, launchCommand.effectiveModel)

    const { sessionId, pty } = ptyManager.spawnSession({
      cwd: normalized.cwd,
      cols: normalized.cols ?? 80,
      rows: normalized.rows ?? 24,
      command: testStub?.command ?? launchCommand.command,
      args: testStub?.args ?? launchCommand.args,
    })

    wirePtySessionEvents(sessionId, pty)

    const result: LaunchAgentResult = {
      sessionId,
      provider: normalized.provider,
      command: launchCommand.command,
      args: launchCommand.args,
      effectiveModel: launchCommand.effectiveModel,
    }

    return result
  })

  return {
    dispose: () => {
      ptyManager.disposeAll()
      ipcMain.removeHandler(IPC_CHANNELS.workspaceSelectDirectory)
      ipcMain.removeHandler(IPC_CHANNELS.ptySpawn)
      ipcMain.removeHandler(IPC_CHANNELS.ptyWrite)
      ipcMain.removeHandler(IPC_CHANNELS.ptyResize)
      ipcMain.removeHandler(IPC_CHANNELS.ptyKill)
      ipcMain.removeHandler(IPC_CHANNELS.agentListModels)
      ipcMain.removeHandler(IPC_CHANNELS.agentLaunch)
    },
  }
}
