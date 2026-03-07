import React, { type JSX } from 'react'
import type { TaskRuntimeStatus } from '@renderer/features/workspace/types'
import { TASK_STATUS_OPTIONS } from './helpers'

export function TaskNodeFooter({
  status,
  onStatusChange,
  onAssignAgent,
  onRunAgent,
}: {
  status: TaskRuntimeStatus
  onStatusChange: (status: TaskRuntimeStatus) => void
  onAssignAgent: () => void
  onRunAgent: () => void
}): JSX.Element {
  return (
    <div className="task-node__footer nodrag">
      <select
        data-testid="task-node-status-select"
        value={status}
        onChange={event => {
          onStatusChange(event.target.value as TaskRuntimeStatus)
        }}
      >
        {TASK_STATUS_OPTIONS.map(option => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        className="task-node__assign-agent"
        data-testid="task-node-assign-agent"
        onClick={event => {
          event.stopPropagation()
          onAssignAgent()
        }}
      >
        Assign
      </button>

      <button
        type="button"
        className="task-node__run-agent"
        data-testid="task-node-run-agent"
        onClick={event => {
          event.stopPropagation()
          onRunAgent()
        }}
      >
        Run Agent
      </button>
    </div>
  )
}
