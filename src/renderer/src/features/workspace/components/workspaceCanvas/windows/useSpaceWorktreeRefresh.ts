import { useCallback } from 'react'
import type { GitWorktreeInfo } from '@shared/types/api'
import { toErrorMessage } from '../helpers'
import { getWorktreeApiMethod } from './spaceWorktree.shared'

export function useSpaceWorktreeRefresh({
  workspacePath,
  setIsLoading,
  setError,
  setBranches,
  setCurrentBranch,
  setWorktrees,
  setExistingBranchName,
  setStartPoint,
}: {
  workspacePath: string
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
  setError: React.Dispatch<React.SetStateAction<string | null>>
  setBranches: React.Dispatch<React.SetStateAction<string[]>>
  setCurrentBranch: React.Dispatch<React.SetStateAction<string | null>>
  setWorktrees: React.Dispatch<React.SetStateAction<GitWorktreeInfo[]>>
  setExistingBranchName: React.Dispatch<React.SetStateAction<string>>
  setStartPoint: React.Dispatch<React.SetStateAction<string>>
}): () => Promise<void> {
  return useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const listBranches = getWorktreeApiMethod('listBranches')
      const listWorktrees = getWorktreeApiMethod('listWorktrees')
      const [branchesResult, worktreesResult] = await Promise.all([
        listBranches({ repoPath: workspacePath }),
        listWorktrees({ repoPath: workspacePath }),
      ])

      setBranches(branchesResult.branches)
      setCurrentBranch(branchesResult.current)
      setWorktrees(worktreesResult.worktrees)

      setExistingBranchName(previous =>
        previous.trim().length > 0
          ? previous
          : (branchesResult.current ?? branchesResult.branches[0] ?? ''),
      )

      setStartPoint(previous => {
        if (previous !== 'HEAD') {
          return previous
        }

        return branchesResult.current ?? previous
      })
    } catch (fetchError) {
      setError(`Failed to load worktree info: ${toErrorMessage(fetchError)}`)
    } finally {
      setIsLoading(false)
    }
  }, [
    setBranches,
    setCurrentBranch,
    setError,
    setExistingBranchName,
    setIsLoading,
    setStartPoint,
    setWorktrees,
    workspacePath,
  ])
}
