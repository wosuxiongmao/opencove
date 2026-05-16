import { expect, test } from '@playwright/test'
import { clearAndSeedWorkspace, launchApp, testWorkspacePath } from './workspace-canvas.helpers'
import { assertTerminalScrollbarGutterSurface } from './workspace-canvas.terminal-scrollbar-gutter.helpers'

test.describe('Workspace Canvas - Terminal scrollbar gutter', () => {
  test('removes xterm native scrollbar + black viewport background (terminal + agent)', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await clearAndSeedWorkspace(
        window,
        [
          {
            id: 'node-a',
            title: 'terminal-a',
            position: { x: 180, y: 140 },
            width: 816,
            height: 320,
          },
          {
            id: 'node-b',
            title: 'codex · gpt-5.2-codex',
            position: { x: 180, y: 520 },
            width: 520,
            height: 320,
            kind: 'agent',
            status: 'running',
            startedAt: '2026-02-09T00:00:00.000Z',
            endedAt: null,
            exitCode: null,
            lastError: null,
            agent: {
              provider: 'codex',
              prompt: 'hydrate agent terminal chrome',
              model: 'gpt-5.2-codex',
              effectiveModel: 'gpt-5.2-codex',
              launchMode: 'new',
              resumeSessionId: null,
              resumeSessionIdVerified: false,
              executionDirectory: testWorkspacePath,
              expectedDirectory: testWorkspacePath,
              directoryMode: 'workspace',
              customDirectory: null,
              shouldCreateDirectory: false,
            },
          },
        ],
        {
          settings: {
            uiTheme: 'light',
            terminalFontSize: 13,
          },
        },
      )

      await expect
        .poll(() => window.evaluate(() => document.documentElement.dataset.coveTheme ?? null))
        .toBe('light')

      const nodes = window.locator('.terminal-node')
      await expect(nodes).toHaveCount(2)
      await expect(nodes.nth(0).locator('.xterm')).toBeVisible()
      await expect(nodes.nth(1).locator('.xterm')).toBeVisible()

      await assertTerminalScrollbarGutterSurface(window, 'node-a', nodes.nth(0))
      await assertTerminalScrollbarGutterSurface(window, 'node-b', nodes.nth(1))
    } finally {
      await electronApp.close()
    }
  })
})
