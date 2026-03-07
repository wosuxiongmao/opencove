import { useMemo } from 'react'
import type { BranchMode } from './spaceWorktree.shared'

export function useSpaceWorktreePanelHandlers({
  setError,
  setViewMode,
  setDeleteBranchOnArchive,
  setArchiveSpaceOnArchive,
  setBranchMode,
  setNewBranchName,
  setStartPoint,
  setExistingBranchName,
  handleSuggestNames,
  handleCreate,
  handleArchive,
}: {
  setError: React.Dispatch<React.SetStateAction<string | null>>
  setViewMode: React.Dispatch<React.SetStateAction<'home' | 'create' | 'archive'>>
  setDeleteBranchOnArchive: React.Dispatch<React.SetStateAction<boolean>>
  setArchiveSpaceOnArchive: React.Dispatch<React.SetStateAction<boolean>>
  setBranchMode: React.Dispatch<React.SetStateAction<BranchMode>>
  setNewBranchName: React.Dispatch<React.SetStateAction<string>>
  setStartPoint: React.Dispatch<React.SetStateAction<string>>
  setExistingBranchName: React.Dispatch<React.SetStateAction<string>>
  handleSuggestNames: () => Promise<void>
  handleCreate: () => Promise<void>
  handleArchive: () => Promise<void>
}): {
  onOpenCreate: () => void
  onOpenArchive: () => void
  onBackHome: () => void
  onBranchModeChange: (mode: BranchMode) => void
  onNewBranchNameChange: (value: string) => void
  onStartPointChange: (value: string) => void
  onExistingBranchNameChange: (value: string) => void
  onSuggestNames: () => void
  onCreate: () => void
  onDeleteBranchOnArchiveChange: (checked: boolean) => void
  onArchiveSpaceOnArchiveChange: (checked: boolean) => void
  onArchive: () => void
} {
  return useMemo(
    () => ({
      onOpenCreate: () => {
        setError(null)
        setViewMode('create')
      },
      onOpenArchive: () => {
        setError(null)
        setDeleteBranchOnArchive(false)
        setArchiveSpaceOnArchive(false)
        setViewMode('archive')
      },
      onBackHome: () => {
        setViewMode('home')
        setError(null)
      },
      onBranchModeChange: (mode: BranchMode) => {
        setBranchMode(mode)
        setError(null)
      },
      onNewBranchNameChange: (value: string) => {
        setNewBranchName(value)
        setError(null)
      },
      onStartPointChange: (value: string) => {
        setStartPoint(value)
        setError(null)
      },
      onExistingBranchNameChange: (value: string) => {
        setExistingBranchName(value)
        setError(null)
      },
      onSuggestNames: () => {
        void handleSuggestNames()
      },
      onCreate: () => {
        void handleCreate()
      },
      onDeleteBranchOnArchiveChange: (checked: boolean) => {
        setDeleteBranchOnArchive(checked)
        setError(null)
      },
      onArchiveSpaceOnArchiveChange: (checked: boolean) => {
        setArchiveSpaceOnArchive(checked)
        setError(null)
      },
      onArchive: () => {
        void handleArchive()
      },
    }),
    [
      handleArchive,
      handleCreate,
      handleSuggestNames,
      setBranchMode,
      setDeleteBranchOnArchive,
      setArchiveSpaceOnArchive,
      setError,
      setExistingBranchName,
      setNewBranchName,
      setStartPoint,
      setViewMode,
    ],
  )
}
