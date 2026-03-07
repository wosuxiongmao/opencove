import { useCallback } from 'react'
import type { AgentSettings } from '../../../../settings/agentConfig'
import { resolveAgentModel } from '../../../../settings/agentConfig'
import { toErrorMessage } from '../helpers'
import { getWorktreeApiMethod } from './spaceWorktree.shared'
import type { WorkspaceSpaceState } from '../../../types'

export function useSpaceWorktreeSuggestNames({
  space,
  spaceNotes,
  spaceTasks,
  agentSettings,
  workspacePath,
  setIsSuggesting,
  setError,
  setNewBranchName,
}: {
  space: WorkspaceSpaceState | null
  spaceNotes: string
  spaceTasks: Array<{ title: string; requirement: string }>
  agentSettings: AgentSettings
  workspacePath: string
  setIsSuggesting: React.Dispatch<React.SetStateAction<boolean>>
  setError: React.Dispatch<React.SetStateAction<string | null>>
  setNewBranchName: React.Dispatch<React.SetStateAction<string>>
}): () => Promise<void> {
  return useCallback(async () => {
    if (!space) {
      return
    }

    setIsSuggesting(true)
    setError(null)

    try {
      const provider = agentSettings.defaultProvider
      const model = resolveAgentModel(agentSettings, provider)
      const suggestWorktreeNames = getWorktreeApiMethod('suggestNames')

      const suggested = await suggestWorktreeNames({
        provider,
        cwd: workspacePath,
        spaceName: space.name,
        spaceNotes: spaceNotes.trim().length > 0 ? spaceNotes.trim() : null,
        tasks: spaceTasks,
        model,
      })

      setNewBranchName(suggested.branchName)
    } catch (suggestError) {
      setError(`AI suggestion failed: ${toErrorMessage(suggestError)}`)
    } finally {
      setIsSuggesting(false)
    }
  }, [
    agentSettings,
    setError,
    setIsSuggesting,
    setNewBranchName,
    space,
    spaceNotes,
    spaceTasks,
    workspacePath,
  ])
}
