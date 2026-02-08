import {
  AGENT_MODEL_OPTIONS,
  AGENT_PROVIDER_LABEL,
  AGENT_PROVIDERS,
  type AgentProvider,
  type AgentSettings,
} from '../agentConfig'

interface SettingsPanelProps {
  settings: AgentSettings
  onChange: (settings: AgentSettings) => void
  onClose: () => void
}

export function SettingsPanel({ settings, onChange, onClose }: SettingsPanelProps): JSX.Element {
  const updateDefaultProvider = (provider: AgentProvider): void => {
    onChange({
      ...settings,
      defaultProvider: provider,
    })
  }

  const updateProviderModel = (provider: AgentProvider, model: string): void => {
    onChange({
      ...settings,
      modelByProvider: {
        ...settings.modelByProvider,
        [provider]: model,
      },
    })
  }

  const selectedModel = settings.modelByProvider[settings.defaultProvider]

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
          <h3>Model By Provider</h3>
          {AGENT_PROVIDERS.map(provider => (
            <div className="settings-panel__row" key={provider}>
              <span>{AGENT_PROVIDER_LABEL[provider]}</span>
              <select
                data-testid={`settings-model-${provider}`}
                value={settings.modelByProvider[provider]}
                onChange={event => {
                  updateProviderModel(provider, event.target.value)
                }}
              >
                {AGENT_MODEL_OPTIONS[provider].map(model => (
                  <option value={model} key={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <p className="settings-panel__hint">
          Current default: {AGENT_PROVIDER_LABEL[settings.defaultProvider]} · {selectedModel}
        </p>
      </section>
    </div>
  )
}
