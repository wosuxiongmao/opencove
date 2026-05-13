import type { TerminalPtyGeometry, RuntimeDiagnosticsDetailValue } from '@shared/contracts/dto'
import type { Size } from '../../../types'
import type { TerminalPtyGeometryDisplayMetrics } from '@contexts/workspace/domain/terminalPtyGeometry'

function runtimeDiagnosticsEnabled(): boolean {
  return window.opencoveApi?.meta?.enableTerminalDiagnostics === true
}

function logTerminalLaunchRuntimeDiagnostics({
  event,
  level,
  message,
  details,
}: {
  event: string
  level: 'info' | 'error'
  message: string
  details: Record<string, RuntimeDiagnosticsDetailValue>
}): void {
  if (!runtimeDiagnosticsEnabled()) {
    return
  }

  window.opencoveApi?.debug?.logRuntimeDiagnostics?.({
    source: 'renderer-workspace-canvas',
    level,
    event: `terminal-launch:${event}`,
    message,
    details,
  })
}

export function logTerminalLaunchGeometryDiagnostics({
  event,
  provider,
  mode,
  frameSize,
  terminalGeometry,
  terminalFontSize,
  terminalDisplayMetrics,
  mountId,
  source,
}: {
  event: string
  provider?: string | null
  mode?: string | null
  frameSize: Size
  terminalGeometry: TerminalPtyGeometry
  terminalFontSize: number
  terminalDisplayMetrics: TerminalPtyGeometryDisplayMetrics
  mountId?: string | null
  source: string
}): void {
  if (!runtimeDiagnosticsEnabled()) {
    return
  }

  const details: Record<string, RuntimeDiagnosticsDetailValue> = {
    source,
    provider: provider ?? null,
    mode: mode ?? null,
    mountId: mountId ?? null,
    frameWidth: frameSize.width,
    frameHeight: frameSize.height,
    cols: terminalGeometry.cols,
    rows: terminalGeometry.rows,
    terminalFontSize,
    displayFontSize: terminalDisplayMetrics.fontSize,
    displayLineHeight: terminalDisplayMetrics.lineHeight ?? null,
    displayLetterSpacing: terminalDisplayMetrics.letterSpacing ?? null,
    displayCssCellWidth: terminalDisplayMetrics.cssCellWidth ?? null,
    displayCssCellHeight: terminalDisplayMetrics.cssCellHeight ?? null,
  }

  logTerminalLaunchRuntimeDiagnostics({
    level: 'info',
    event,
    message: 'Renderer computed terminal launch geometry.',
    details,
  })
}

export function logTerminalLaunchStepDiagnostics({
  event,
  provider,
  mode,
  mountId,
  details = {},
}: {
  event: string
  provider?: string | null
  mode?: string | null
  mountId?: string | null
  details?: Record<string, RuntimeDiagnosticsDetailValue>
}): void {
  logTerminalLaunchRuntimeDiagnostics({
    level: 'info',
    event,
    message: 'Renderer advanced through the terminal launch flow.',
    details: {
      provider: provider ?? null,
      mode: mode ?? null,
      mountId: mountId ?? null,
      ...details,
    },
  })
}

export function logTerminalLaunchErrorDiagnostics({
  event,
  provider,
  mode,
  mountId,
  error,
  details = {},
}: {
  event: string
  provider?: string | null
  mode?: string | null
  mountId?: string | null
  error: unknown
  details?: Record<string, RuntimeDiagnosticsDetailValue>
}): void {
  const errorDetails =
    error instanceof Error
      ? {
          errorName: error.name,
          errorMessage: error.message,
          errorStack: error.stack ?? null,
        }
      : {
          errorName: null,
          errorMessage: String(error),
          errorStack: null,
        }

  logTerminalLaunchRuntimeDiagnostics({
    level: 'error',
    event,
    message: 'Renderer terminal launch flow failed.',
    details: {
      provider: provider ?? null,
      mode: mode ?? null,
      mountId: mountId ?? null,
      ...errorDetails,
      ...details,
    },
  })
}
