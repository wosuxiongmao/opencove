import { expect, test, _electron as electron } from '@playwright/test'
import path from 'path'

const electronAppPath = path.resolve(__dirname, '../../')
const storageKey = 'cove:m0:workspace-state'

test.describe('Settings', () => {
  test('persists agent provider and model selection', async () => {
    const electronApp = await electron.launch({
      args: [electronAppPath],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        COVE_TEST_WORKSPACE: path.resolve(__dirname, '../../'),
      },
    })

    const window = await electronApp.firstWindow()

    try {
      await window.waitForLoadState('domcontentloaded')
      await window.evaluate(key => {
        window.localStorage.removeItem(key)
      }, storageKey)
      await window.reload({ waitUntil: 'domcontentloaded' })

      const settingsButton = window.locator('.workspace-sidebar__settings')
      await expect(settingsButton).toBeVisible()
      await settingsButton.click()

      const defaultProvider = window.locator('#settings-default-provider')
      await expect(defaultProvider).toBeVisible()
      await defaultProvider.selectOption('codex')

      const codexModelSelect = window.locator('[data-testid="settings-model-codex"]')
      await codexModelSelect.selectOption('o3')

      await window.locator('.settings-panel__close').click()
      await expect(window.locator('.workspace-sidebar__agent-provider')).toHaveText('Codex')
      await expect(window.locator('.workspace-sidebar__agent-model')).toHaveText('o3')

      await window.reload({ waitUntil: 'domcontentloaded' })
      await expect(window.locator('.workspace-sidebar__agent-provider')).toHaveText('Codex')
      await expect(window.locator('.workspace-sidebar__agent-model')).toHaveText('o3')

      const persistedSettings = await window.evaluate(key => {
        const raw = window.localStorage.getItem(key)
        if (!raw) {
          return null
        }

        const parsed = JSON.parse(raw) as {
          settings?: {
            defaultProvider?: string
            modelByProvider?: {
              codex?: string
            }
          }
        }

        return parsed.settings ?? null
      }, storageKey)

      expect(persistedSettings?.defaultProvider).toBe('codex')
      expect(persistedSettings?.modelByProvider?.codex).toBe('o3')
    } finally {
      await electronApp.close()
    }
  })
})
