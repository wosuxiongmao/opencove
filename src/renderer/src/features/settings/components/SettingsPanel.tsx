import { useState } from 'react'
import {
  AGENT_PROVIDER_LABEL,
  AGENT_PROVIDERS,
  resolveAgentModel,
  type AgentProvider,
  type AgentSettings,
} from '../agentConfig'

interface ProviderModelCatalogEntry {
  models: string[]
  source: string | null
  fetchedAt: string | null
  isLoading: boolean
  error: string | null
}

interface SettingsPanelProps {
  settings: AgentSettings
  modelCatalogByProvider: Record<AgentProvider, ProviderModelCatalogEntry>
  onRefreshProviderModels: (provider: AgentProvider) => void
  onChange: (settings: AgentSettings) => void
  onClose: () => void
}

function createInitialInputState(): Record<AgentProvider, string> {
  return {
    'claude-code': '',
    codex: '',
  }
}

export function SettingsPanel({
  settings,
  modelCatalogByProvider,
  onRefreshProviderModels,
  onChange,
  onClose,
}: SettingsPanelProps): JSX.Element {
  const [addModelInputByProvider, setAddModelInputByProvider] = useState<
    Record<AgentProvider, string>
  >(() => createInitialInputState())

  const updateDefaultProvider = (provider: AgentProvider): void => {
    onChange({
      ...settings,
      defaultProvider: provider,
    })
  }

  const updateProviderCustomModelEnabled = (provider: AgentProvider, enabled: boolean): void => {
    onChange({
      ...settings,
      customModelEnabledByProvider: {
        ...settings.customModelEnabledByProvider,
        [provider]: enabled,
      },
    })
  }

  const selectProviderModel = (provider: AgentProvider, model: string): void => {
    onChange({
      ...settings,
      customModelEnabledByProvider: {
        ...settings.customModelEnabledByProvider,
        [provider]: true,
      },
      customModelByProvider: {
        ...settings.customModelByProvider,
        [provider]: model,
      },
    })
  }

  const removeCustomModelOption = (provider: AgentProvider, model: string): void => {
    const currentOptions = settings.customModelOptionsByProvider[provider]
    if (!currentOptions.includes(model)) {
      return
    }

    const nextOptions = currentOptions.filter(option => option !== model)
    const currentSelected = settings.customModelByProvider[provider]

    onChange({
      ...settings,
      customModelByProvider: {
        ...settings.customModelByProvider,
        [provider]: currentSelected === model ? '' : currentSelected,
      },
      customModelOptionsByProvider: {
        ...settings.customModelOptionsByProvider,
        [provider]: nextOptions,
      },
    })
  }

  const updateAddModelInput = (provider: AgentProvider, value: string): void => {
    setAddModelInputByProvider(prev => ({
      ...prev,
      [provider]: value,
    }))
  }

  const addCustomModelOption = (provider: AgentProvider): void => {
    const candidate = addModelInputByProvider[provider].trim()
    if (candidate.length === 0) {
      return
    }

    const existingOptions = settings.customModelOptionsByProvider[provider]
    const nextOptions = existingOptions.includes(candidate)
      ? existingOptions
      : [...existingOptions, candidate]

    onChange({
      ...settings,
      customModelEnabledByProvider: {
        ...settings.customModelEnabledByProvider,
        [provider]: true,
      },
      customModelByProvider: {
        ...settings.customModelByProvider,
        [provider]: candidate,
      },
      customModelOptionsByProvider: {
        ...settings.customModelOptionsByProvider,
        [provider]: nextOptions,
      },
    })

    setAddModelInputByProvider(prev => ({
      ...prev,
      [provider]: '',
    }))
  }

  const selectedModel =
    resolveAgentModel(settings, settings.defaultProvider) ?? 'Default (Follow CLI)'

  return (
    <div
      className="settings-backdrop"
      onClick={() => {
        onClose()
      }}
    >
      <section
        className="settings-panel"
        onClick={event => {
          event.stopPropagation()
        }}
      >
        <div className="settings-panel__header">
          <h2>Settings</h2>
          <button
            type="button"
            className="settings-panel__close"
            onClick={() => {
              onClose()
            }}
          >
            ×
          </button>
        </div>

        <div className="settings-panel__section">
          <label htmlFor="settings-default-provider">Default Agent</label>
          <select
            id="settings-default-provider"
            value={settings.defaultProvider}
            onChange={event => {
              updateDefaultProvider(event.target.value as AgentProvider)
            }}
          >
            {AGENT_PROVIDERS.map(provider => (
              <option value={provider} key={provider}>
                {AGENT_PROVIDER_LABEL[provider]}
              </option>
            ))}
          </select>
        </div>

        <div className="settings-panel__section">
          <h3>Model Override</h3>
          {AGENT_PROVIDERS.map(provider => {
            const modelCatalog = modelCatalogByProvider[provider]
            const customEnabled = settings.customModelEnabledByProvider[provider]
            const customModel = settings.customModelByProvider[provider]
            const customOptions = settings.customModelOptionsByProvider[provider]

            const allModels = [
              ...new Set(
                [...modelCatalog.models, ...customOptions, customModel]
                  .map(model => model.trim())
                  .filter(model => model.length > 0),
              ),
            ]

            const addInputValue = addModelInputByProvider[provider]
            const addInputPlaceholder =
              provider === 'codex'
                ? 'Example: gpt-5.2-codex'
                : 'Example: claude-sonnet-4-5-20250929'

            return (
              <article className="settings-provider-card" key={provider}>
                <div className="settings-provider-card__header">
                  <strong>{AGENT_PROVIDER_LABEL[provider]}</strong>
                  <button
                    type="button"
                    className="settings-provider-card__refresh"
                    disabled={modelCatalog.isLoading}
                    onClick={() => {
                      onRefreshProviderModels(provider)
                    }}
                  >
                    {modelCatalog.isLoading ? 'Refreshing...' : 'Refresh Models'}
                  </button>
                </div>

                <label className="settings-provider-card__toggle">
                  <input
                    type="checkbox"
                    data-testid={`settings-custom-model-enabled-${provider}`}
                    checked={customEnabled}
                    onChange={event => {
                      updateProviderCustomModelEnabled(provider, event.target.checked)
                    }}
                  />
                  <span>Use custom model (unchecked = follow CLI default)</span>
                </label>

                <div
                  className="settings-provider-card__model-list"
                  data-testid={`settings-model-list-${provider}`}
                >
                  {allModels.length === 0 ? (
                    <p className="settings-provider-card__empty">No models yet. Add one below.</p>
                  ) : (
                    allModels.map(model => {
                      const isCustomOption = customOptions.includes(model)

                      return (
                        <div className="settings-provider-card__model-item" key={model}>
                          <label className="settings-provider-card__model-radio">
                            <input
                              type="radio"
                              name={`settings-model-${provider}`}
                              checked={customModel === model}
                              onChange={() => {
                                selectProviderModel(provider, model)
                              }}
                            />
                            <span>{model}</span>
                          </label>

                          {isCustomOption ? (
                            <button
                              type="button"
                              className="settings-provider-card__model-remove"
                              onClick={() => {
                                removeCustomModelOption(provider, model)
                              }}
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                      )
                    })
                  )}
                </div>

                <div className="settings-provider-card__add-row">
                  <input
                    type="text"
                    data-testid={`settings-custom-model-add-input-${provider}`}
                    value={addInputValue}
                    placeholder={addInputPlaceholder}
                    onChange={event => {
                      updateAddModelInput(provider, event.target.value)
                    }}
                    onKeyDown={event => {
                      if (event.key !== 'Enter') {
                        return
                      }

                      event.preventDefault()
                      addCustomModelOption(provider)
                    }}
                  />
                  <button
                    type="button"
                    data-testid={`settings-custom-model-add-button-${provider}`}
                    disabled={addInputValue.trim().length === 0}
                    onClick={() => {
                      addCustomModelOption(provider)
                    }}
                  >
                    Add
                  </button>
                </div>

                <div className="settings-provider-card__meta">
                  <span>
                    Source: {modelCatalog.source ?? 'N/A'} · {modelCatalog.models.length} models
                  </span>
                  {modelCatalog.error ? (
                    <span className="settings-provider-card__error">
                      Error: {modelCatalog.error}
                    </span>
                  ) : modelCatalog.fetchedAt ? (
                    <span>Updated: {new Date(modelCatalog.fetchedAt).toLocaleTimeString()}</span>
                  ) : (
                    <span>Waiting for first fetch...</span>
                  )}
                </div>
              </article>
            )
          })}
        </div>

        <p className="settings-panel__hint">
          Current default: {AGENT_PROVIDER_LABEL[settings.defaultProvider]} · {selectedModel}
        </p>
      </section>
    </div>
  )
}
