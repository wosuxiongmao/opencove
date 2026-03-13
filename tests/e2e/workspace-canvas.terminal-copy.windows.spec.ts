import { expect, test } from '@playwright/test'
import { clearAndSeedWorkspace, launchApp } from './workspace-canvas.helpers'

const windowsOnly = process.platform !== 'win32'

async function selectTerminalOutput(
  window: Parameters<typeof clearAndSeedWorkspace>[0],
  nodeId: string,
) {
  return await window.evaluate(async currentNodeId => {
    const api = window.__opencoveTerminalSelectionTestApi
    if (!api) {
      return { hasSelection: false, selection: null }
    }

    api.selectAll(currentNodeId)

    await new Promise<void>(resolve => {
      window.requestAnimationFrame(() => resolve())
    })

    return {
      hasSelection: api.hasSelection(currentNodeId),
      selection: api.getSelection(currentNodeId),
    }
  }, nodeId)
}

test.describe('Workspace Canvas - Terminal Copy (Windows)', () => {
  test.skip(windowsOnly, 'Windows only')

  test('Ctrl+C copies selected terminal output without sending SIGINT', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await electronApp.evaluate(async ({ clipboard }) => {
        clipboard.clear()
      })

      await clearAndSeedWorkspace(window, [
        {
          id: 'node-copy-windows',
          title: 'terminal-copy-windows',
          position: { x: 120, y: 120 },
          width: 520,
          height: 320,
        },
      ])

      const terminal = window.locator('.terminal-node').first()
      await expect(terminal).toBeVisible()

      const xterm = terminal.locator('.xterm')
      await expect(xterm).toBeVisible()
      await xterm.click()
      await expect(terminal.locator('.xterm-helper-textarea')).toBeFocused()

      const readyToken = `OPENCOVE_WINDOWS_COPY_READY_${Date.now()}`
      const sigintToken = `OPENCOVE_WINDOWS_COPY_SIGINT_${Date.now()}`

      await window.keyboard.type(
        `node -e "process.on('SIGINT',()=>console.log('${sigintToken}'));console.log('${readyToken}');setInterval(()=>{},1000)"`,
      )
      await window.keyboard.press('Enter')
      await expect(terminal).toContainText(readyToken)

      const selected = await selectTerminalOutput(window, 'node-copy-windows')
      expect(selected.hasSelection).toBe(true)
      expect(selected.selection).toContain(readyToken)

      await window.keyboard.press('Control+C')
      await window.waitForTimeout(250)

      await expect(terminal).not.toContainText(sigintToken)

      const clipboardText = await electronApp.evaluate(async ({ clipboard }) => {
        return clipboard.readText()
      })
      expect(clipboardText).toContain(readyToken)
    } finally {
      await electronApp.close()
    }
  })
})
