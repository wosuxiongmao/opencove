export const AGENT_PROVIDERS = ['claude-code', 'codex'] as const

export type AgentProvider = (typeof AGENT_PROVIDERS)[number]

export const AGENT_PROVIDER_LABEL: Record<AgentProvider, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
}

export const AGENT_MODEL_OPTIONS: Record<AgentProvider, readonly string[]> = {
  'claude-code': ['claude-sonnet-4-5', 'claude-opus-4-1'],
  codex: ['gpt-5-codex', 'o3'],
}

export type AgentModelByProvider = {
  [provider in AgentProvider]: string
}

export interface AgentSettings {
  defaultProvider: AgentProvider
  modelByProvider: AgentModelByProvider
}

function defaultModelForProvider(provider: AgentProvider): string {
  return AGENT_MODEL_OPTIONS[provider][0]
}

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  defaultProvider: 'claude-code',
  modelByProvider: {
    'claude-code': defaultModelForProvider('claude-code'),
    codex: defaultModelForProvider('codex'),
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

function isValidProvider(value: unknown): value is AgentProvider {
  return typeof value === 'string' && AGENT_PROVIDERS.includes(value as AgentProvider)
}

function normalizeModel(provider: AgentProvider, model: unknown): string {
  const options = AGENT_MODEL_OPTIONS[provider]
  if (typeof model === 'string' && options.includes(model)) {
    return model
  }

  return defaultModelForProvider(provider)
}

export function normalizeAgentSettings(value: unknown): AgentSettings {
  if (!isRecord(value)) {
    return DEFAULT_AGENT_SETTINGS
  }

  const defaultProvider = isValidProvider(value.defaultProvider)
    ? value.defaultProvider
    : DEFAULT_AGENT_SETTINGS.defaultProvider

  const modelByProviderInput = isRecord(value.modelByProvider) ? value.modelByProvider : {}

  const modelByProvider = AGENT_PROVIDERS.reduce<AgentModelByProvider>((acc, provider) => {
    acc[provider] = normalizeModel(provider, modelByProviderInput[provider])
    return acc
  }, {} as AgentModelByProvider)

  return {
    defaultProvider,
    modelByProvider,
  }
}
