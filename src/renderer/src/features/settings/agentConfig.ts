export const AGENT_PROVIDERS = ['claude-code', 'codex'] as const

export type AgentProvider = (typeof AGENT_PROVIDERS)[number]

export const AGENT_PROVIDER_LABEL: Record<AgentProvider, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
}

export type AgentCustomModelEnabledByProvider = {
  [provider in AgentProvider]: boolean
}

export type AgentCustomModelByProvider = {
  [provider in AgentProvider]: string
}

export type AgentCustomModelOptionsByProvider = {
  [provider in AgentProvider]: string[]
}

export interface AgentSettings {
  defaultProvider: AgentProvider
  customModelEnabledByProvider: AgentCustomModelEnabledByProvider
  customModelByProvider: AgentCustomModelByProvider
  customModelOptionsByProvider: AgentCustomModelOptionsByProvider
}

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  defaultProvider: 'claude-code',
  customModelEnabledByProvider: {
    'claude-code': false,
    codex: false,
  },
  customModelByProvider: {
    'claude-code': '',
    codex: '',
  },
  customModelOptionsByProvider: {
    'claude-code': [],
    codex: [],
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

function isValidProvider(value: unknown): value is AgentProvider {
  return typeof value === 'string' && AGENT_PROVIDERS.includes(value as AgentProvider)
}

function normalizeTextValue(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

function normalizeModelEnabled(value: unknown): boolean | null {
  if (typeof value !== 'boolean') {
    return null
  }

  return value
}

function normalizeModelOptions(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const normalized: string[] = []
  for (const item of value) {
    const model = normalizeTextValue(item)
    if (model.length === 0 || normalized.includes(model)) {
      continue
    }

    normalized.push(model)
  }

  return normalized
}

export function resolveAgentModel(settings: AgentSettings, provider: AgentProvider): string | null {
  if (!settings.customModelEnabledByProvider[provider]) {
    return null
  }

  const model = settings.customModelByProvider[provider].trim()
  return model.length > 0 ? model : null
}

export function normalizeAgentSettings(value: unknown): AgentSettings {
  if (!isRecord(value)) {
    return DEFAULT_AGENT_SETTINGS
  }

  const defaultProvider = isValidProvider(value.defaultProvider)
    ? value.defaultProvider
    : DEFAULT_AGENT_SETTINGS.defaultProvider

  const enabledInput = isRecord(value.customModelEnabledByProvider)
    ? value.customModelEnabledByProvider
    : {}

  const customModelInput = isRecord(value.customModelByProvider) ? value.customModelByProvider : {}

  const legacyModelInput = isRecord(value.modelByProvider) ? value.modelByProvider : {}

  const customModelEnabledByProvider = AGENT_PROVIDERS.reduce<AgentCustomModelEnabledByProvider>(
    (acc, provider) => {
      const normalizedEnabled = normalizeModelEnabled(enabledInput[provider])
      const legacyModel = normalizeTextValue(legacyModelInput[provider])

      acc[provider] = normalizedEnabled === null ? legacyModel.length > 0 : normalizedEnabled

      return acc
    },
    { ...DEFAULT_AGENT_SETTINGS.customModelEnabledByProvider },
  )

  const customModelByProvider = AGENT_PROVIDERS.reduce<AgentCustomModelByProvider>(
    (acc, provider) => {
      const current = customModelInput[provider] ?? legacyModelInput[provider]
      acc[provider] = normalizeTextValue(current)
      return acc
    },
    { ...DEFAULT_AGENT_SETTINGS.customModelByProvider },
  )

  const optionsInput = isRecord(value.customModelOptionsByProvider)
    ? value.customModelOptionsByProvider
    : {}

  const customModelOptionsByProvider = AGENT_PROVIDERS.reduce<AgentCustomModelOptionsByProvider>(
    (acc, provider) => {
      const options = normalizeModelOptions(optionsInput[provider])
      const selectedModel = customModelByProvider[provider]

      if (selectedModel.length > 0 && !options.includes(selectedModel)) {
        options.unshift(selectedModel)
      }

      acc[provider] = options
      return acc
    },
    {
      'claude-code': [...DEFAULT_AGENT_SETTINGS.customModelOptionsByProvider['claude-code']],
      codex: [...DEFAULT_AGENT_SETTINGS.customModelOptionsByProvider.codex],
    },
  )

  return {
    defaultProvider,
    customModelEnabledByProvider,
    customModelByProvider,
    customModelOptionsByProvider,
  }
}
