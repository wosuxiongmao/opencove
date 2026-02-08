import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AGENT_SETTINGS,
  normalizeAgentSettings,
} from '../../../src/renderer/src/features/settings/agentConfig'

describe('agent settings normalization', () => {
  it('returns defaults for invalid input', () => {
    expect(normalizeAgentSettings(null)).toEqual(DEFAULT_AGENT_SETTINGS)
    expect(normalizeAgentSettings('invalid')).toEqual(DEFAULT_AGENT_SETTINGS)
  })

  it('keeps valid provider and model values', () => {
    const result = normalizeAgentSettings({
      defaultProvider: 'codex',
      modelByProvider: {
        'claude-code': 'claude-opus-4-1',
        codex: 'o3',
      },
    })

    expect(result.defaultProvider).toBe('codex')
    expect(result.modelByProvider['claude-code']).toBe('claude-opus-4-1')
    expect(result.modelByProvider.codex).toBe('o3')
  })

  it('falls back for unsupported model values', () => {
    const result = normalizeAgentSettings({
      defaultProvider: 'claude-code',
      modelByProvider: {
        'claude-code': 'custom-model',
        codex: 'not-in-list',
      },
    })

    expect(result.modelByProvider['claude-code']).toBe('claude-sonnet-4-5')
    expect(result.modelByProvider.codex).toBe('gpt-5-codex')
  })
})
