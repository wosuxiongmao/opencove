import type {
  CopyWorkspacePathInput,
  EnsureDirectoryInput,
  OpenWorkspacePathInput,
  WorkspacePathOpenerId,
} from '../../../../shared/types/api'
import { isAbsolute } from 'node:path'

function normalizePathValue(value: unknown, channel: string): string {
  const path = typeof value === 'string' ? value.trim() : ''

  if (path.length === 0) {
    throw new Error(`Invalid path for ${channel}`)
  }

  if (!isAbsolute(path)) {
    throw new Error(`${channel} requires an absolute path`)
  }

  return path
}

function normalizeWorkspacePathOpenerId(value: unknown): WorkspacePathOpenerId {
  if (
    value === 'finder' ||
    value === 'cursor' ||
    value === 'vscode' ||
    value === 'windsurf' ||
    value === 'zed'
  ) {
    return value
  }

  throw new Error('Invalid openerId for workspace:open-path')
}

export function normalizeEnsureDirectoryPayload(payload: unknown): EnsureDirectoryInput {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload for workspace:ensure-directory')
  }

  const record = payload as Record<string, unknown>
  return {
    path: normalizePathValue(record.path, 'workspace:ensure-directory'),
  }
}

export function normalizeCopyWorkspacePathPayload(payload: unknown): CopyWorkspacePathInput {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload for workspace:copy-path')
  }

  const record = payload as Record<string, unknown>
  return {
    path: normalizePathValue(record.path, 'workspace:copy-path'),
  }
}

export function normalizeOpenWorkspacePathPayload(payload: unknown): OpenWorkspacePathInput {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload for workspace:open-path')
  }

  const record = payload as Record<string, unknown>
  return {
    path: normalizePathValue(record.path, 'workspace:open-path'),
    openerId: normalizeWorkspacePathOpenerId(record.openerId),
  }
}
