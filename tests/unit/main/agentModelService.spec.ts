import { afterEach, describe, expect, it } from 'vitest'
import { listAgentModels } from '../../../src/main/infrastructure/agent/AgentModelService'

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('AgentModelService', () => {
  it('returns static Claude Code models without requiring api credentials', async () => {
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.CLAUDE_API_KEY
    delete process.env.CLAUDE_CODE_API_KEY
    delete process.env.CLAUDE_APIKEY

    const result = await listAgentModels('claude-code')

    expect(result.provider).toBe('claude-code')
    expect(result.source).toBe('claude-static')
    expect(result.error).toBeNull()
    expect(result.models.map(model => model.id)).toEqual([
      'claude-opus-4-6',
      'claude-sonnet-4-5-20250929',
      'claude-haiku-4-5-20251001',
    ])
    expect(result.models.find(model => model.id === 'claude-sonnet-4-5-20250929')?.isDefault).toBe(
      true,
    )
  })
})
