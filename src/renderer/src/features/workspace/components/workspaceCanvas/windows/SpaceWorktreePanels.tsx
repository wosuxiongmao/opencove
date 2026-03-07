import React from 'react'
import type { WorkspaceSpaceState } from '../../../types'
import type { BranchMode, SpaceWorktreeViewMode } from './spaceWorktree.shared'

export function SpaceWorktreePanels({
  space,
  viewMode,
  isBusy,
  isMutating,
  isSuggesting,
  isSpaceOnWorkspaceRoot,
  branches,
  currentBranch,
  branchMode,
  newBranchName,
  startPoint,
  existingBranchName,
  deleteBranchOnArchive,
  archiveSpaceOnArchive,
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
  viewMode: SpaceWorktreeViewMode
  isBusy: boolean
  isMutating: boolean
  isSuggesting: boolean
  isSpaceOnWorkspaceRoot: boolean
  branches: string[]
  currentBranch: string | null
  branchMode: BranchMode
  newBranchName: string
  startPoint: string
  existingBranchName: string
  deleteBranchOnArchive: boolean
  archiveSpaceOnArchive: boolean
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
    <>
      {viewMode === 'home' ? (
        <div className="workspace-space-worktree__view" data-testid="space-worktree-home-view">
          <section className="workspace-space-worktree__surface workspace-space-worktree__surface--actions">
            <h4>What do you want to do?</h4>
            <div className="workspace-space-worktree__action-grid workspace-space-worktree__action-grid--two">
              {isSpaceOnWorkspaceRoot ? (
                <button
                  type="button"
                  className="workspace-space-worktree__action-card"
                  data-testid="space-worktree-open-create"
                  disabled={isBusy}
                  onClick={onOpenCreate}
                >
                  <span className="workspace-space-worktree__action-title">Create</span>
                  <span className="workspace-space-worktree__action-description">
                    Create and bind a fresh worktree for this Space.
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  className="workspace-space-worktree__action-card workspace-space-worktree__action-card--danger"
                  data-testid="space-worktree-open-archive"
                  disabled={isBusy}
                  onClick={onOpenArchive}
                >
                  <span className="workspace-space-worktree__action-title">Archive</span>
                  <span className="workspace-space-worktree__action-description">
                    Rebind this Space to workspace root and clean up its worktree.
                  </span>
                </button>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {viewMode === 'create' ? (
        <div className="workspace-space-worktree__view" data-testid="space-worktree-create-view">
          <div className="workspace-space-worktree__view-header">
            <button
              type="button"
              className="cove-window__action cove-window__action--ghost"
              data-testid="space-worktree-back-home"
              disabled={isBusy}
              onClick={onBackHome}
            >
              ← Back
            </button>
            <h4>Create worktree</h4>
          </div>

          <section className="workspace-space-worktree__surface">
            <p className="workspace-space-worktree__hint">
              Cove will generate the internal worktree path automatically.
            </p>

            <div className="workspace-space-worktree__mode-tabs">
              <button
                type="button"
                className={
                  branchMode === 'new'
                    ? 'workspace-space-worktree__mode-tab workspace-space-worktree__mode-tab--active'
                    : 'workspace-space-worktree__mode-tab'
                }
                data-testid="space-worktree-mode-new"
                disabled={isBusy}
                onClick={() => {
                  onBranchModeChange('new')
                }}
              >
                New Branch
              </button>
              <button
                type="button"
                className={
                  branchMode === 'existing'
                    ? 'workspace-space-worktree__mode-tab workspace-space-worktree__mode-tab--active'
                    : 'workspace-space-worktree__mode-tab'
                }
                data-testid="space-worktree-mode-existing"
                disabled={isBusy}
                onClick={() => {
                  onBranchModeChange('existing')
                }}
              >
                Existing Branch
              </button>
            </div>

            {branchMode === 'new' ? (
              <div
                className="workspace-space-worktree__create-grid"
                data-testid="space-worktree-create-grid"
              >
                <div className="cove-window__field-row">
                  <label htmlFor="space-worktree-start-point">Start point</label>
                  <select
                    id="space-worktree-start-point"
                    data-testid="space-worktree-start-point"
                    value={startPoint}
                    disabled={isBusy}
                    onChange={event => {
                      onStartPointChange(event.target.value)
                    }}
                  >
                    <option value="HEAD">HEAD</option>
                    {currentBranch ? <option value={currentBranch}>{currentBranch}</option> : null}
                    {branches
                      .filter(branch => branch !== currentBranch)
                      .map(branch => (
                        <option value={branch} key={branch}>
                          {branch}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="cove-window__field-row workspace-space-worktree__create-grid-span-two">
                  <label htmlFor="space-worktree-branch-name">Branch name</label>
                  <input
                    id="space-worktree-branch-name"
                    data-testid="space-worktree-branch-name"
                    value={newBranchName}
                    disabled={isBusy}
                    placeholder="e.g. space/infra-core"
                    onChange={event => {
                      onNewBranchNameChange(event.target.value)
                    }}
                  />
                </div>
              </div>
            ) : (
              <div
                className="workspace-space-worktree__create-grid workspace-space-worktree__create-grid--two"
                data-testid="space-worktree-create-grid"
              >
                <div className="cove-window__field-row">
                  <label htmlFor="space-worktree-existing-branch">Branch</label>
                  <select
                    id="space-worktree-existing-branch"
                    data-testid="space-worktree-existing-branch"
                    value={existingBranchName}
                    disabled={isBusy}
                    onChange={event => {
                      onExistingBranchNameChange(event.target.value)
                    }}
                  >
                    {branches.map(branch => (
                      <option value={branch} key={branch}>
                        {branch}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="workspace-space-worktree__inline-actions">
              <button
                type="button"
                className="cove-window__action cove-window__action--secondary"
                data-testid="space-worktree-suggest-ai"
                disabled={isBusy}
                onClick={onSuggestNames}
              >
                {isSuggesting ? 'Generating...' : 'Generate by AI'}
              </button>
              <button
                type="button"
                className="cove-window__action cove-window__action--primary"
                data-testid="space-worktree-create"
                disabled={isBusy}
                onClick={onCreate}
              >
                {isMutating ? 'Creating...' : 'Create & Bind'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {viewMode === 'archive' ? (
        <div className="workspace-space-worktree__view" data-testid="space-worktree-archive-view">
          <div className="workspace-space-worktree__view-header">
            <button
              type="button"
              className="cove-window__action cove-window__action--ghost"
              data-testid="space-worktree-back-home"
              disabled={isBusy}
              onClick={onBackHome}
            >
              ← Back
            </button>
            <h4>Archive Space</h4>
          </div>

          <section className="workspace-space-worktree__surface workspace-space-worktree__surface--danger">
            <p>
              This will rebind <strong>{space.name}</strong> to the workspace root and remove its
              current worktree.
            </p>

            <label className="workspace-space-worktree__checkbox">
              <input
                type="checkbox"
                data-testid="space-worktree-archive-delete-branch"
                checked={deleteBranchOnArchive}
                disabled={isBusy}
                onChange={event => {
                  onDeleteBranchOnArchiveChange(event.target.checked)
                }}
              />
              Also delete the current branch
            </label>

            <label className="workspace-space-worktree__checkbox">
              <input
                type="checkbox"
                data-testid="space-worktree-archive-space"
                checked={archiveSpaceOnArchive}
                disabled={isBusy}
                onChange={event => {
                  onArchiveSpaceOnArchiveChange(event.target.checked)
                }}
              />
              Also archive this Space and remove all nodes inside it
            </label>

            <div className="workspace-space-worktree__inline-actions">
              <button
                type="button"
                className="cove-window__action cove-window__action--danger"
                data-testid="space-worktree-archive-submit"
                disabled={isBusy}
                onClick={onArchive}
              >
                {isMutating ? 'Archiving...' : 'Archive Space'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
