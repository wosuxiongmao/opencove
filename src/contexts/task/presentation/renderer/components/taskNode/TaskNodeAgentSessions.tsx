import React, { useEffect, useMemo, useState, type JSX } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import type { AgentProvider } from '@contexts/settings/domain/agentSettings'
import { isResumeSessionBindingVerified } from '@contexts/agent/domain/agentResumeBinding'
import type { AgentRuntimeStatus, TaskAgentSessionRecord } from '@renderer/features/workspace/types'
import {
  providerLabel,
  toAgentRuntimeLabel,
} from '@renderer/features/workspace/components/workspaceCanvas/helpers'
import { formatTaskTimestamp, resolveAgentSessionTone } from './helpers'

interface LinkedAgentSummary {
  nodeId: string
  title: string
  provider: AgentProvider
  status: AgentRuntimeStatus | null
  startedAt: string | null
}

export function TaskNodeAgentSessions({
  linkedAgentNode,
  agentSessions,
  currentDirectory,
  onResumeAgentSession,
  onRemoveAgentSessionRecord,
}: {
  linkedAgentNode: LinkedAgentSummary | null
  agentSessions: TaskAgentSessionRecord[]
  currentDirectory: string
  onResumeAgentSession: (recordId: string) => void
  onRemoveAgentSessionRecord: (recordId: string) => void
}): JSX.Element {
  const [agentSessionMenu, setAgentSessionMenu] = useState<{
    recordId: string
    x: number
    y: number
  } | null>(null)
  const [resumeConfirmRecordId, setResumeConfirmRecordId] = useState<string | null>(null)

  useEffect(() => {
    if (!agentSessionMenu) {
      return
    }

    const closeMenu = (event: MouseEvent): void => {
      if (event.target instanceof Element && event.target.closest('.task-agent-session-menu')) {
        return
      }

      setAgentSessionMenu(null)
    }

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setAgentSessionMenu(null)
      }
    }

    window.addEventListener('mousedown', closeMenu)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('mousedown', closeMenu)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [agentSessionMenu])

  const sortedAgentSessions = useMemo(() => {
    return [...agentSessions].sort((left, right) => {
      const leftTime = Date.parse(left.lastRunAt)
      const rightTime = Date.parse(right.lastRunAt)
      return (
        (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
      )
    })
  }, [agentSessions])

  const agentSessionMenuRecord = useMemo(() => {
    if (!agentSessionMenu) {
      return null
    }

    return sortedAgentSessions.find(record => record.id === agentSessionMenu.recordId) ?? null
  }, [agentSessionMenu, sortedAgentSessions])

  const resumeConfirmRecord = useMemo(() => {
    if (!resumeConfirmRecordId) {
      return null
    }

    return sortedAgentSessions.find(record => record.id === resumeConfirmRecordId) ?? null
  }, [resumeConfirmRecordId, sortedAgentSessions])

  const isResumeDirectoryMismatch = useMemo(() => {
    if (!resumeConfirmRecord) {
      return false
    }

    return resumeConfirmRecord.boundDirectory !== currentDirectory
  }, [currentDirectory, resumeConfirmRecord])

  return (
    <>
      <div className="task-node__agents nodrag" data-testid="task-node-agent-sessions">
        <div className="task-node__agents-header">
          <span>Agents</span>
          <span className="task-node__agents-count">
            {(linkedAgentNode ? 1 : 0) + sortedAgentSessions.length}
          </span>
        </div>

        {linkedAgentNode || sortedAgentSessions.length > 0 ? (
          <div className="task-node__agents-list">
            {linkedAgentNode ? (
              <div
                className="workspace-agent-item workspace-agent-item--nested task-node__agent-session task-node__agent-session--linked"
                data-testid={`task-node-agent-session-linked-${linkedAgentNode.nodeId}`}
              >
                <div className="workspace-agent-item__headline">
                  <span className="workspace-agent-item__title">{linkedAgentNode.title}</span>
                  <span
                    className={`workspace-agent-item__status workspace-agent-item__status--agent workspace-agent-item__status--${resolveAgentSessionTone(linkedAgentNode.status)}`}
                  >
                    {toAgentRuntimeLabel(linkedAgentNode.status)}
                  </span>
                </div>
                <div className="workspace-agent-item__meta">
                  <span className="workspace-agent-item__meta-text">
                    {providerLabel(linkedAgentNode.provider)} ·{' '}
                    {formatTaskTimestamp(linkedAgentNode.startedAt)}
                  </span>
                </div>
              </div>
            ) : null}

            {sortedAgentSessions.map(record => (
              <div
                key={record.id}
                className="workspace-agent-item workspace-agent-item--nested task-node__agent-session"
                data-testid={`task-node-agent-session-record-${record.id}`}
                onContextMenu={event => {
                  event.preventDefault()
                  event.stopPropagation()
                  setAgentSessionMenu({
                    recordId: record.id,
                    x: event.clientX,
                    y: event.clientY,
                  })
                }}
              >
                <div className="workspace-agent-item__headline">
                  <span className="workspace-agent-item__title">
                    {providerLabel(record.provider)} ·{' '}
                    {record.effectiveModel ?? record.model ?? 'default-model'}
                  </span>
                  <span
                    className={`workspace-agent-item__status workspace-agent-item__status--agent workspace-agent-item__status--${resolveAgentSessionTone(record.status)}`}
                  >
                    {toAgentRuntimeLabel(record.status)}
                  </span>
                </div>
                <div className="workspace-agent-item__meta">
                  <span className="workspace-agent-item__meta-text">
                    Last run · {formatTaskTimestamp(record.lastRunAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="task-node__agents-empty">No agent sessions yet.</div>
        )}
      </div>

      {agentSessionMenu ? (
        <div
          className="workspace-context-menu task-agent-session-menu"
          data-testid="task-node-agent-session-menu"
          style={{ top: agentSessionMenu.y, left: agentSessionMenu.x }}
          onMouseDown={event => {
            event.stopPropagation()
          }}
          onClick={event => {
            event.stopPropagation()
          }}
        >
          {agentSessionMenuRecord && isResumeSessionBindingVerified(agentSessionMenuRecord) ? (
            <button
              type="button"
              data-testid={`task-node-agent-session-menu-resume-${agentSessionMenu.recordId}`}
              onClick={() => {
                setResumeConfirmRecordId(agentSessionMenu.recordId)
                setAgentSessionMenu(null)
              }}
            >
              <RotateCcw className="workspace-context-menu__icon" aria-hidden="true" />
              <span className="workspace-context-menu__label">Resume</span>
            </button>
          ) : null}
          <button
            type="button"
            data-testid={`task-node-agent-session-menu-remove-${agentSessionMenu.recordId}`}
            onClick={() => {
              onRemoveAgentSessionRecord(agentSessionMenu.recordId)
              setAgentSessionMenu(null)
            }}
          >
            <Trash2 className="workspace-context-menu__icon" aria-hidden="true" />
            <span className="workspace-context-menu__label">Remove Record</span>
          </button>
        </div>
      ) : null}

      {resumeConfirmRecord ? (
        <div
          className="cove-window-backdrop task-agent-resume-backdrop"
          data-testid="task-node-agent-session-resume-confirm"
          onClick={() => {
            setResumeConfirmRecordId(null)
          }}
        >
          <section
            className="cove-window task-agent-resume"
            onClick={event => {
              event.stopPropagation()
            }}
          >
            <h3>Resume Agent Session</h3>
            <p className="cove-window__meta">
              Resuming continues the same CLI session and keeps its original bound directory.
            </p>

            <div className="cove-window__field-row">
              <label>Bound directory</label>
              <input value={resumeConfirmRecord.boundDirectory} disabled />
            </div>

            <div className="cove-window__field-row">
              <label>Current directory</label>
              <input value={currentDirectory} disabled />
            </div>

            {isResumeDirectoryMismatch ? (
              <p className="cove-window__error">
                Directory mismatch detected. The agent will still operate in the bound directory.
                The agent window will be labeled to avoid mistakes.
              </p>
            ) : (
              <p className="cove-window__meta">
                The agent window will be labeled if its bound directory differs from the current
                directory.
              </p>
            )}

            <div className="cove-window__actions">
              <button
                type="button"
                className="cove-window__action cove-window__action--ghost"
                onClick={() => {
                  setResumeConfirmRecordId(null)
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`cove-window__action ${isResumeDirectoryMismatch ? 'cove-window__action--danger' : 'cove-window__action--primary'}`}
                data-testid={`task-node-agent-session-resume-confirm-resume-${resumeConfirmRecord.id}`}
                onClick={() => {
                  onResumeAgentSession(resumeConfirmRecord.id)
                  setResumeConfirmRecordId(null)
                }}
              >
                Resume
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
