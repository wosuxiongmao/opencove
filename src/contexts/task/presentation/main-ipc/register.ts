import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../../shared/contracts/ipc'
import type {
  SuggestTaskTitleInput,
  SuggestTaskTitleResult,
} from '../../../../shared/contracts/dto'
import type { IpcRegistrationDisposable } from '../../../../main/ipc/types'
import { suggestTaskTitle } from '../../infrastructure/cli/TaskTitleGenerator'
import type { ApprovedWorkspaceStore } from '../../../../main/modules/workspace/ApprovedWorkspaceStore'
import { normalizeSuggestTaskTitlePayload } from './validate'

export function registerTaskIpcHandlers(
  approvedWorkspaces: ApprovedWorkspaceStore,
): IpcRegistrationDisposable {
  ipcMain.handle(
    IPC_CHANNELS.taskSuggestTitle,
    async (_event, payload: SuggestTaskTitleInput): Promise<SuggestTaskTitleResult> => {
      const normalized = normalizeSuggestTaskTitlePayload(payload)
      const isApproved = await approvedWorkspaces.isPathApproved(normalized.cwd)
      if (!isApproved) {
        throw new Error('task:suggest-title cwd is outside approved workspaces')
      }
      return await suggestTaskTitle(normalized)
    },
  )

  return {
    dispose: () => {
      ipcMain.removeHandler(IPC_CHANNELS.taskSuggestTitle)
    },
  }
}
