import type {
  AgentProvider,
  StandardWindowSizeBucket,
} from '@contexts/settings/domain/agentSettings'
import {
  resolveTerminalPtyGeometryForNodeFrame,
  type TerminalPtyGeometryDisplayMetrics,
} from '@contexts/workspace/domain/terminalPtyGeometry'
import type { TerminalPtyGeometry } from '@shared/contracts/dto'
import type { Size } from '../../../types'
import { resolveDefaultAgentWindowSize } from '../constants'

export interface AgentLaunchGeometry {
  frameSize: Size
  terminalGeometry: TerminalPtyGeometry
}

export function resolveAgentLaunchGeometryForFrame({
  frameSize,
  terminalFontSize,
  terminalDisplayMetrics,
}: {
  frameSize: Size
  terminalFontSize: number
  terminalDisplayMetrics?: TerminalPtyGeometryDisplayMetrics | null
}): AgentLaunchGeometry {
  return {
    frameSize,
    terminalGeometry: resolveTerminalPtyGeometryForNodeFrame({
      width: frameSize.width,
      height: frameSize.height,
      terminalFontSize,
      displayMetrics: terminalDisplayMetrics,
    }),
  }
}

export function resolveDefaultAgentLaunchGeometry({
  bucket,
  provider,
  terminalFontSize,
  terminalDisplayMetrics,
}: {
  bucket: StandardWindowSizeBucket
  provider?: AgentProvider | null
  terminalFontSize: number
  terminalDisplayMetrics?: TerminalPtyGeometryDisplayMetrics | null
}): AgentLaunchGeometry {
  return resolveAgentLaunchGeometryForFrame({
    frameSize: resolveDefaultAgentWindowSize(bucket, provider),
    terminalFontSize,
    terminalDisplayMetrics,
  })
}
