import { IPC_CHANNELS } from '../../../../shared/contracts/ipc'
import type {
  AgentProviderId,
  TerminalSessionMetadataEvent,
  TerminalSessionStateEvent,
} from '../../../../shared/contracts/dto'
import { locateAgentResumeSessionId } from '../../../agent/infrastructure/cli/AgentSessionLocator'
import { resolveSessionFilePath } from '../../../agent/infrastructure/watchers/SessionFileResolver'
import { SessionTurnStateWatcher } from '../../../agent/infrastructure/watchers/SessionTurnStateWatcher'

const SESSION_STATE_WATCHER_LOCATE_TIMEOUT_MS = 1_500
const SESSION_STATE_WATCHER_FILE_TIMEOUT_MS = 1_500
const SESSION_STATE_WATCHER_RETRY_BASE_DELAY_MS = 250
const SESSION_STATE_WATCHER_RETRY_MAX_DELAY_MS = 15_000
const SESSION_STATE_WATCHER_RETRY_MAX_IDLE_MS = 30 * 60_000

export interface SessionStateWatcherStartInput {
  sessionId: string
  provider: AgentProviderId
  cwd: string
  resumeSessionId: string | null
  startedAtMs: number
}

type SendToAllWindows = <Payload>(channel: string, payload: Payload) => void

export function createSessionStateWatcherController({
  sendToAllWindows,
  reportIssue,
}: {
  sendToAllWindows: SendToAllWindows
  reportIssue: (message: string) => void
}): {
  start: (input: SessionStateWatcherStartInput) => void
  noteInteraction: (sessionId: string) => void
  disposeSession: (sessionId: string) => void
  dispose: () => void
} {
  const stateWatcherBySession = new Map<string, SessionTurnStateWatcher>()
  const stateWatcherVersionBySession = new Map<string, number>()
  const stateWatcherStartInputBySession = new Map<string, SessionStateWatcherStartInput>()
  const stateWatcherLastInteractionAtMsBySession = new Map<string, number>()
  const stateWatcherResolvedResumeSessionIdBySession = new Map<string, string>()
  const stateWatcherRetryCountBySession = new Map<string, number>()
  const stateWatcherRetryTimerBySession = new Map<string, NodeJS.Timeout>()
  const stateWatcherStartingSessionIds = new Set<string>()
  const stateWatcherLastBroadcastResumeSessionIdBySession = new Map<string, string>()

  const bumpStateWatcherVersion = (sessionId: string): number => {
    const next = (stateWatcherVersionBySession.get(sessionId) ?? 0) + 1
    stateWatcherVersionBySession.set(sessionId, next)
    return next
  }

  const cancelSessionStateWatcherRetry = (sessionId: string): void => {
    const timer = stateWatcherRetryTimerBySession.get(sessionId)
    if (!timer) {
      return
    }

    clearTimeout(timer)
    stateWatcherRetryTimerBySession.delete(sessionId)
  }

  const resolveSessionStateWatcherRetryDelay = (attempt: number): number => {
    if (attempt <= 0) {
      return SESSION_STATE_WATCHER_RETRY_BASE_DELAY_MS
    }

    const delay = SESSION_STATE_WATCHER_RETRY_BASE_DELAY_MS * 2 ** attempt
    return Math.min(delay, SESSION_STATE_WATCHER_RETRY_MAX_DELAY_MS)
  }

  const broadcastSessionMetadata = (sessionId: string, resumeSessionId: string | null): void => {
    const eventPayload: TerminalSessionMetadataEvent = {
      sessionId,
      resumeSessionId,
    }
    sendToAllWindows(IPC_CHANNELS.ptySessionMetadata, eventPayload)
  }

  const clearSessionStateWatcher = (
    sessionId: string,
    options: { disposeStartInput?: boolean } = {},
  ): void => {
    bumpStateWatcherVersion(sessionId)
    cancelSessionStateWatcherRetry(sessionId)
    stateWatcherStartingSessionIds.delete(sessionId)

    const watcher = stateWatcherBySession.get(sessionId)
    if (watcher) {
      watcher.dispose()
      stateWatcherBySession.delete(sessionId)
    }

    if (options.disposeStartInput === true) {
      stateWatcherStartInputBySession.delete(sessionId)
      stateWatcherLastInteractionAtMsBySession.delete(sessionId)
      stateWatcherResolvedResumeSessionIdBySession.delete(sessionId)
      stateWatcherRetryCountBySession.delete(sessionId)
      stateWatcherLastBroadcastResumeSessionIdBySession.delete(sessionId)
    }
  }

  const scheduleSessionStateWatcherAttempt = (
    sessionId: string,
    watcherVersion: number,
    delayMs: number,
  ): void => {
    cancelSessionStateWatcherRetry(sessionId)

    const input = stateWatcherStartInputBySession.get(sessionId)
    if (!input) {
      return
    }

    const lastInteractionAtMs = stateWatcherLastInteractionAtMsBySession.get(sessionId) ?? null
    const retryAnchorMs =
      typeof lastInteractionAtMs === 'number' ? lastInteractionAtMs : input.startedAtMs
    if (Date.now() - retryAnchorMs > SESSION_STATE_WATCHER_RETRY_MAX_IDLE_MS) {
      return
    }

    stateWatcherRetryTimerBySession.set(
      sessionId,
      setTimeout(() => {
        void attemptStartSessionStateWatcher(sessionId, watcherVersion)
      }, delayMs),
    )
  }

  const broadcastSessionMetadataOnce = (sessionId: string, resumeSessionId: string): void => {
    const previous = stateWatcherLastBroadcastResumeSessionIdBySession.get(sessionId) ?? null
    if (previous === resumeSessionId) {
      return
    }

    stateWatcherLastBroadcastResumeSessionIdBySession.set(sessionId, resumeSessionId)
    broadcastSessionMetadata(sessionId, resumeSessionId)
  }

  async function attemptStartSessionStateWatcher(
    sessionId: string,
    watcherVersion: number,
  ): Promise<void> {
    if (stateWatcherStartingSessionIds.has(sessionId) || stateWatcherBySession.has(sessionId)) {
      return
    }

    const input = stateWatcherStartInputBySession.get(sessionId)
    if (!input) {
      return
    }

    if ((stateWatcherVersionBySession.get(sessionId) ?? 0) !== watcherVersion) {
      return
    }

    stateWatcherStartingSessionIds.add(sessionId)

    try {
      const lastInteractionAtMs = stateWatcherLastInteractionAtMsBySession.get(sessionId) ?? null
      const startedAtHints = [
        ...(typeof lastInteractionAtMs === 'number' && lastInteractionAtMs !== input.startedAtMs
          ? [lastInteractionAtMs]
          : []),
        input.startedAtMs,
      ]

      const resolvedSessionId =
        input.resumeSessionId ??
        stateWatcherResolvedResumeSessionIdBySession.get(sessionId) ??
        (await (async (): Promise<string | null> => {
          for (const startedAtMs of startedAtHints) {
            // eslint-disable-next-line no-await-in-loop
            const resolved = await locateAgentResumeSessionId({
              provider: input.provider,
              cwd: input.cwd,
              startedAtMs,
              timeoutMs: SESSION_STATE_WATCHER_LOCATE_TIMEOUT_MS,
            })

            if (resolved) {
              return resolved
            }
          }

          return null
        })())

      if ((stateWatcherVersionBySession.get(sessionId) ?? 0) !== watcherVersion) {
        return
      }

      if (!resolvedSessionId) {
        const attempt = stateWatcherRetryCountBySession.get(sessionId) ?? 0
        stateWatcherRetryCountBySession.set(sessionId, attempt + 1)
        scheduleSessionStateWatcherAttempt(
          sessionId,
          watcherVersion,
          resolveSessionStateWatcherRetryDelay(attempt),
        )
        return
      }

      stateWatcherResolvedResumeSessionIdBySession.set(sessionId, resolvedSessionId)
      broadcastSessionMetadataOnce(sessionId, resolvedSessionId)

      const sessionFilePath = await resolveSessionFilePath({
        provider: input.provider,
        cwd: input.cwd,
        sessionId: resolvedSessionId,
        startedAtMs: input.startedAtMs,
        timeoutMs: SESSION_STATE_WATCHER_FILE_TIMEOUT_MS,
      })

      if ((stateWatcherVersionBySession.get(sessionId) ?? 0) !== watcherVersion) {
        return
      }

      if (!sessionFilePath) {
        const attempt = stateWatcherRetryCountBySession.get(sessionId) ?? 0
        stateWatcherRetryCountBySession.set(sessionId, attempt + 1)
        scheduleSessionStateWatcherAttempt(
          sessionId,
          watcherVersion,
          resolveSessionStateWatcherRetryDelay(attempt),
        )
        return
      }

      const watcher = new SessionTurnStateWatcher({
        provider: input.provider,
        sessionId,
        filePath: sessionFilePath,
        onState: (stateSessionId, state) => {
          const eventPayload: TerminalSessionStateEvent = {
            sessionId: stateSessionId,
            state,
          }
          sendToAllWindows(IPC_CHANNELS.ptyState, eventPayload)
        },
        onError: error => {
          const detail =
            error instanceof Error ? `${error.name}: ${error.message}` : 'unknown watcher error'
          reportIssue(
            `[cove] state watcher failed for ${input.provider} session ${sessionId}: ${detail}`,
          )
          clearSessionStateWatcher(sessionId)
          scheduleSessionStateWatcherAttempt(
            sessionId,
            stateWatcherVersionBySession.get(sessionId) ?? 0,
            resolveSessionStateWatcherRetryDelay(0),
          )
        },
      })

      if ((stateWatcherVersionBySession.get(sessionId) ?? 0) !== watcherVersion) {
        watcher.dispose()
        return
      }

      stateWatcherBySession.set(sessionId, watcher)
      watcher.start()
      cancelSessionStateWatcherRetry(sessionId)
      stateWatcherRetryCountBySession.delete(sessionId)
    } finally {
      stateWatcherStartingSessionIds.delete(sessionId)
    }
  }

  const start = (input: SessionStateWatcherStartInput): void => {
    clearSessionStateWatcher(input.sessionId, { disposeStartInput: true })
    stateWatcherStartInputBySession.set(input.sessionId, input)
    stateWatcherLastInteractionAtMsBySession.set(input.sessionId, input.startedAtMs)

    const watcherVersion = stateWatcherVersionBySession.get(input.sessionId) ?? 0
    scheduleSessionStateWatcherAttempt(input.sessionId, watcherVersion, 0)
  }

  const noteInteraction = (sessionId: string): void => {
    if (
      !stateWatcherStartInputBySession.has(sessionId) ||
      stateWatcherBySession.has(sessionId) ||
      stateWatcherStartingSessionIds.has(sessionId)
    ) {
      return
    }

    stateWatcherLastInteractionAtMsBySession.set(sessionId, Date.now())
    stateWatcherRetryCountBySession.set(sessionId, 0)
    scheduleSessionStateWatcherAttempt(
      sessionId,
      stateWatcherVersionBySession.get(sessionId) ?? 0,
      0,
    )
  }

  const disposeSession = (sessionId: string): void => {
    clearSessionStateWatcher(sessionId, { disposeStartInput: true })
  }

  const dispose = (): void => {
    stateWatcherBySession.forEach(watcher => {
      watcher.dispose()
    })
    stateWatcherBySession.clear()
    stateWatcherVersionBySession.clear()
    stateWatcherStartInputBySession.clear()
    stateWatcherLastInteractionAtMsBySession.clear()
    stateWatcherResolvedResumeSessionIdBySession.clear()
    stateWatcherRetryCountBySession.clear()
    stateWatcherStartingSessionIds.clear()
    stateWatcherLastBroadcastResumeSessionIdBySession.clear()

    stateWatcherRetryTimerBySession.forEach(timer => {
      clearTimeout(timer)
    })
    stateWatcherRetryTimerBySession.clear()
  }

  return {
    start,
    noteInteraction,
    disposeSession,
    dispose,
  }
}
