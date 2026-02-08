import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AGENT_SETTINGS,
  normalizeAgentSettings,
  resolveAgentModel,
} from '../../../src/renderer/src/features/settings/agentConfig'

describe('agent settings normalization', () => {
  it('returns defaults for invalid input', () => {
    expect(normalizeAgentSettings(null)).toEqual(DEFAULT_AGENT_SETTINGS)
    expect(normalizeAgentSettings('invalid')).toEqual(DEFAULT_AGENT_SETTINGS)
  })

  it('keeps valid provider, custom model, and model option fields', () => {
    const result = normalizeAgentSettings({
      defaultProvider: 'codex',
      customModelEnabledByProvider: {
        'claude-code': true,
        codex: false,
      },
      customModelByProvider: {
        'claude-code': 'claude-opus-4-6',
        codex: 'gpt-5.2-codex',
      },
      customModelOptionsByProvider: {
        'claude-code': ['claude-opus-4-6', 'claude-sonnet-4-5-20250929'],
        codex: ['gpt-5.2-codex', 'gpt-5.2-codex'],
      },
    })

    expect(result.defaultProvider).toBe('codex')
    expect(result.customModelEnabledByProvider['claude-code']).toBe(true)
    expect(result.customModelEnabledByProvider.codex).toBe(false)
    expect(result.customModelByProvider['claude-code']).toBe('claude-opus-4-6')
    expect(result.customModelByProvider.codex).toBe('gpt-5.2-codex')
    expect(result.customModelOptionsByProvider['claude-code']).toEqual([
      'claude-opus-4-6',
      'claude-sonnet-4-5-20250929',
    ])
    expect(result.customModelOptionsByProvider.codex).toEqual(['gpt-5.2-codex'])
    expect(resolveAgentModel(result, 'claude-code')).toBe('claude-opus-4-6')
    expect(resolveAgentModel(result, 'codex')).toBeNull()
  })

  it('trims custom model and keeps default behavior when empty', () => {
    const result = normalizeAgentSettings({
      defaultProvider: 'claude-code',
      customModelEnabledByProvider: {
        'claude-code': true,
        codex: true,
      },
      customModelByProvider: {
        'claude-code': '   ',
        codex: '  gpt-5.2-codex  ',
      },
      customModelOptionsByProvider: {
        'claude-code': ['  claude-opus-4-6  ', ''],
        codex: ['  gpt-5.2-codex  '],
      },
    })

    expect(result.customModelByProvider['claude-code']).toBe('')
    expect(result.customModelByProvider.codex).toBe('gpt-5.2-codex')
    expect(result.customModelOptionsByProvider['claude-code']).toEqual(['claude-opus-4-6'])
    expect(result.customModelOptionsByProvider.codex).toEqual(['gpt-5.2-codex'])
    expect(resolveAgentModel(result, 'claude-code')).toBeNull()
    expect(resolveAgentModel(result, 'codex')).toBe('gpt-5.2-codex')
  })

  it('migrates legacy modelByProvider to custom override', () => {
    const result = normalizeAgentSettings({
      defaultProvider: 'codex',
      modelByProvider: {
        'claude-code': 'claude-sonnet-4-5-20250929',
        codex: 'gpt-5.2-codex',
      },
    })

    expect(result.customModelEnabledByProvider['claude-code']).toBe(true)
    expect(result.customModelEnabledByProvider.codex).toBe(true)
    expect(result.customModelByProvider['claude-code']).toBe('claude-sonnet-4-5-20250929')
    expect(result.customModelByProvider.codex).toBe('gpt-5.2-codex')
  })

  it('ensures selected custom model appears in options list', () => {
    const result = normalizeAgentSettings({
      defaultProvider: 'claude-code',
      customModelEnabledByProvider: {
        'claude-code': true,
        codex: false,
      },
      customModelByProvider: {
        'claude-code': 'claude-custom-lab',
        codex: '',
      },
      customModelOptionsByProvider: {
        'claude-code': ['claude-opus-4-6'],
        codex: [],
      },
    })

    expect(result.customModelOptionsByProvider['claude-code']).toEqual([
      'claude-custom-lab',
      'claude-opus-4-6',
    ])
  })
})
