import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { promisify } from 'node:util'
import { clipboard, dialog, ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '../../../../shared/constants/ipc'
import type {
  CopyWorkspacePathInput,
  EnsureDirectoryInput,
  ListWorkspacePathOpenersResult,
  OpenWorkspacePathInput,
  WorkspaceDirectory,
  WorkspacePathOpener,
  WorkspacePathOpenerId,
} from '../../../../shared/types/api'
import type { IpcRegistrationDisposable } from '../../../ipc/types'
import type { ApprovedWorkspaceStore } from '../ApprovedWorkspaceStore'
import {
  normalizeCopyWorkspacePathPayload,
  normalizeEnsureDirectoryPayload,
  normalizeOpenWorkspacePathPayload,
} from './validate'

const execFileAsync = promisify(execFile)

const MAC_PATH_OPENERS: Array<WorkspacePathOpener & { application?: string }> = [
  { id: 'finder', label: 'Finder' },
  { id: 'cursor', label: 'Cursor', application: 'Cursor' },
  { id: 'vscode', label: 'VS Code', application: 'Visual Studio Code' },
  { id: 'windsurf', label: 'Windsurf', application: 'Windsurf' },
  { id: 'zed', label: 'Zed', application: 'Zed' },
]

async function isMacApplicationAvailable(application: string): Promise<boolean> {
  try {
    await execFileAsync('open', ['-Ra', application])
    return true
  } catch {
    return false
  }
}

async function listAvailableWorkspacePathOpeners(): Promise<WorkspacePathOpener[]> {
  if (process.platform !== 'darwin') {
    return []
  }

  const openerResults = await Promise.all(
    MAC_PATH_OPENERS.map(async candidate => {
      if (!candidate.application) {
        return { id: candidate.id, label: candidate.label }
      }

      return (await isMacApplicationAvailable(candidate.application))
        ? { id: candidate.id, label: candidate.label }
        : null
    }),
  )

  return openerResults.filter((candidate): candidate is WorkspacePathOpener => candidate !== null)
}

async function openWorkspacePath(path: string, openerId: WorkspacePathOpenerId): Promise<void> {
  if (openerId === 'finder') {
    const error = await shell.openPath(path)
    if (error.trim().length > 0) {
      throw new Error(error)
    }

    return
  }

  if (process.platform !== 'darwin') {
    throw new Error('Opening paths in external apps is only supported on macOS right now')
  }

  const opener = MAC_PATH_OPENERS.find(candidate => candidate.id === openerId) ?? null
  if (!opener?.application) {
    throw new Error('Unsupported path opener')
  }

  await execFileAsync('open', ['-a', opener.application, path])
}

export function registerWorkspaceIpcHandlers(
  approvedWorkspaces: ApprovedWorkspaceStore,
): IpcRegistrationDisposable {
  ipcMain.handle(
    IPC_CHANNELS.workspaceSelectDirectory,
    async (): Promise<WorkspaceDirectory | null> => {
      if (process.env.NODE_ENV === 'test' && process.env.COVE_TEST_WORKSPACE) {
        const testWorkspacePath = resolve(process.env.COVE_TEST_WORKSPACE)
        await approvedWorkspaces.registerRoot(testWorkspacePath)
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

      await approvedWorkspaces.registerRoot(workspacePath)

      return {
        id: crypto.randomUUID(),
        name: workspaceName,
        path: workspacePath,
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.workspaceEnsureDirectory,
    async (_event, payload: EnsureDirectoryInput) => {
      const normalized = normalizeEnsureDirectoryPayload(payload)

      const isApproved = await approvedWorkspaces.isPathApproved(normalized.path)
      if (!isApproved) {
        throw new Error('workspace:ensure-directory path is outside approved workspaces')
      }

      await mkdir(normalized.path, { recursive: true })
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.workspaceCopyPath,
    async (_event, payload: CopyWorkspacePathInput) => {
      const normalized = normalizeCopyWorkspacePathPayload(payload)

      const isApproved = await approvedWorkspaces.isPathApproved(normalized.path)
      if (!isApproved) {
        throw new Error('workspace:copy-path path is outside approved workspaces')
      }

      clipboard.writeText(normalized.path)
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.workspaceListPathOpeners,
    async (): Promise<ListWorkspacePathOpenersResult> => ({
      openers: await listAvailableWorkspacePathOpeners(),
    }),
  )

  ipcMain.handle(
    IPC_CHANNELS.workspaceOpenPath,
    async (_event, payload: OpenWorkspacePathInput) => {
      const normalized = normalizeOpenWorkspacePathPayload(payload)

      const isApproved = await approvedWorkspaces.isPathApproved(normalized.path)
      if (!isApproved) {
        throw new Error('workspace:open-path path is outside approved workspaces')
      }

      await openWorkspacePath(normalized.path, normalized.openerId)
    },
  )

  return {
    dispose: () => {
      ipcMain.removeHandler(IPC_CHANNELS.workspaceSelectDirectory)
      ipcMain.removeHandler(IPC_CHANNELS.workspaceEnsureDirectory)
      ipcMain.removeHandler(IPC_CHANNELS.workspaceCopyPath)
      ipcMain.removeHandler(IPC_CHANNELS.workspaceListPathOpeners)
      ipcMain.removeHandler(IPC_CHANNELS.workspaceOpenPath)
    },
  }
}
