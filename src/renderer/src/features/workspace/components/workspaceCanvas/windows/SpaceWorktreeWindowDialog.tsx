import React from 'react'
import type { GitWorktreeInfo } from '@shared/types/api'
import type { WorkspaceSpaceState } from '../../../types'
import { SpaceWorktreePanels } from './SpaceWorktreePanels'
import type { BranchMode, SpaceWorktreeViewMode } from './spaceWorktree.shared'

export function SpaceWorktreeWindowDialog({
  space,
  isSpaceOnWorkspaceRoot,
  currentWorktree,
  viewMode,
  isBusy,
  isMutating,
  isSuggesting,
  branches,
  currentBranch,
  branchMode,
  newBranchName,
  startPoint,
  existingBranchName,
  deleteBranchOnArchive,
  archiveSpaceOnArchive,
  error,
  guardIsBusy,
  onBackdropClose,
  onClose,
  onOpenCreate,
  onOpenArchive,
  onBackHome,
  onBranchModeChange,
  onNewBranchNameChange,
  onStartPointChange,
  onExistingBranchNameChange,
  onSuggestNames,
  onCreate,
  onDeleteBranchOnArchiveChange,
  onArchiveSpaceOnArchiveChange,
  onArchive,
}: {
  space: WorkspaceSpaceState
  isSpaceOnWorkspaceRoot: boolean
  currentWorktree: GitWorktreeInfo | null
  viewMode: SpaceWorktreeViewMode
  isBusy: boolean
  isMutating: boolean
  isSuggesting: boolean
  branches: string[]
  currentBranch: string | null
  branchMode: BranchMode
  newBranchName: string
  startPoint: string
  existingBranchName: string
  deleteBranchOnArchive: boolean
  archiveSpaceOnArchive: boolean
  error: string | null
  guardIsBusy: boolean
  onBackdropClose: () => void
  onClose: () => void
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
}): React.JSX.Element {
  return (
    <div
      className="cove-window-backdrop workspace-space-worktree-backdrop"
      onClick={() => {
        if (isBusy || guardIsBusy) {
          return
        }

        onBackdropClose()
      }}
    >
      <section
        className="cove-window workspace-space-worktree"
        data-testid="space-worktree-window"
        onClick={event => {
          event.stopPropagation()
        }}
      >
        <header className="workspace-space-worktree__header">
          <h3>Space Workspace</h3>
          <p className="workspace-space-worktree__meta">
            {isSpaceOnWorkspaceRoot
              ? `${space.name} is using the workspace root.`
              : `${space.name} is bound to a Cove-managed worktree.`}
          </p>
          <div className="workspace-space-worktree__status-row">
            <span className="workspace-space-worktree__status-chip">
              {isSpaceOnWorkspaceRoot ? 'Workspace Root' : 'Managed Worktree'}
            </span>
            {currentWorktree?.branch ? (
              <span className="workspace-space-worktree__status-chip workspace-space-worktree__status-chip--branch">
                Branch: {currentWorktree.branch}
              </span>
            ) : null}
          </div>
        </header>

        <SpaceWorktreePanels
          space={space}
          viewMode={viewMode}
          isBusy={isBusy}
          isMutating={isMutating}
          isSuggesting={isSuggesting}
          isSpaceOnWorkspaceRoot={isSpaceOnWorkspaceRoot}
          branches={branches}
          currentBranch={currentBranch}
          branchMode={branchMode}
          newBranchName={newBranchName}
          startPoint={startPoint}
          existingBranchName={existingBranchName}
          deleteBranchOnArchive={deleteBranchOnArchive}
          archiveSpaceOnArchive={archiveSpaceOnArchive}
          onOpenCreate={onOpenCreate}
          onOpenArchive={onOpenArchive}
          onBackHome={onBackHome}
          onBranchModeChange={onBranchModeChange}
          onNewBranchNameChange={onNewBranchNameChange}
          onStartPointChange={onStartPointChange}
          onExistingBranchNameChange={onExistingBranchNameChange}
          onSuggestNames={onSuggestNames}
          onCreate={onCreate}
          onDeleteBranchOnArchiveChange={onDeleteBranchOnArchiveChange}
          onArchiveSpaceOnArchiveChange={onArchiveSpaceOnArchiveChange}
          onArchive={onArchive}
        />

        {error ? (
          <p className="cove-window__error workspace-space-worktree__error">{error}</p>
        ) : null}

        <div className="cove-window__actions workspace-space-worktree__actions">
          <button
            type="button"
            className="cove-window__action cove-window__action--ghost"
            data-testid="space-worktree-close"
            disabled={isBusy || guardIsBusy}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </section>
    </div>
  )
}
