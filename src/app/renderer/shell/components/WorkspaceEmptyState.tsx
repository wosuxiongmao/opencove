import React from 'react'

export function WorkspaceEmptyState({
  onAddWorkspace,
}: {
  onAddWorkspace: () => void
}): React.JSX.Element {
  return (
    <div className="workspace-empty-state">
      <h2>Add a project to start</h2>
      <p>Each project has its own infinite canvas and terminals.</p>
      <button type="button" onClick={onAddWorkspace}>
        Add Project
      </button>
    </div>
  )
}
