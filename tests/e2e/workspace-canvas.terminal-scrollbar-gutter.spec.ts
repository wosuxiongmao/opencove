import { expect, test, type Locator } from '@playwright/test'
import {
  buildEchoSequenceCommand,
  buildNodeEvalCommand,
  clearAndSeedWorkspace,
  launchApp,
  readCanvasViewport,
  testWorkspacePath,
} from './workspace-canvas.helpers'

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
        .poll(() =>
          window.evaluate(() => {
            return document.documentElement.dataset.coveTheme ?? null
          }),
        )
        .toBe('light')

      const nodes = window.locator('.terminal-node')
      await expect(nodes).toHaveCount(2)
      await expect(nodes.nth(0).locator('.xterm')).toBeVisible()
      await expect(nodes.nth(1).locator('.xterm')).toBeVisible()

      const assertTerminalSurface = async (nodeId: string, node: Locator) => {
        const xterm = node.locator('.xterm')
        const tailToken = `OPENCOVE_SCROLLBAR_GUTTER_${nodeId}_220`
        await xterm.click()
        await expect(node.locator('.xterm-helper-textarea')).toBeFocused()
        await window.keyboard.type(
          buildEchoSequenceCommand(`OPENCOVE_SCROLLBAR_GUTTER_${nodeId}`, 220),
        )
        await window.keyboard.press('Enter')
        await expect(node).toContainText(tailToken, { timeout: 20_000 })

        const scrollbar = node.locator('.xterm-scrollable-element .scrollbar.vertical')
        const slider = scrollbar.locator('.slider')
        await expect(slider).toBeVisible({ timeout: 20_000 })

        const viewport = node.locator('.xterm-viewport')
        await expect(viewport).toBeVisible()
        await expect(viewport).toHaveCSS('overflow-y', 'hidden')
        await expect(viewport).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')

        const terminalBody = node.locator('.terminal-node__terminal')
        await expect(terminalBody).toBeVisible()
        await expect(terminalBody).not.toHaveCSS('background-color', 'rgb(0, 0, 0)')

        await expect
          .poll(
            async () =>
              await window.evaluate(id => {
                const nodeElement = document.querySelector(
                  `.react-flow__node[data-id="${id}"] .terminal-node`,
                )
                const sliderElement = nodeElement?.querySelector(
                  '.xterm-scrollable-element .scrollbar.vertical .slider',
                )
                const scrollbarElement = nodeElement?.querySelector(
                  '.xterm-scrollable-element .scrollbar.vertical',
                )
                if (
                  !(nodeElement instanceof HTMLElement) ||
                  !(sliderElement instanceof HTMLElement) ||
                  !(scrollbarElement instanceof HTMLElement)
                ) {
                  return null
                }

                const sliderRect = sliderElement.getBoundingClientRect()
                const point = {
                  x: sliderRect.left + sliderRect.width / 2,
                  y: sliderRect.top + sliderRect.height / 2,
                }
                const hitTarget = document.elementFromPoint(point.x, point.y)
                const resizer = hitTarget?.closest('.terminal-node__resizer')
                const hitScrollbarElement = hitTarget?.closest(
                  '.xterm-scrollable-element .scrollbar.vertical',
                )

                return {
                  hitScrollbar: hitScrollbarElement === scrollbarElement,
                  hitResizer: resizer !== null,
                  hitClass:
                    hitTarget instanceof HTMLElement
                      ? hitTarget.className
                      : (hitTarget?.nodeName ?? null),
                }
              }, nodeId),
            { timeout: 5_000 },
          )
          .toMatchObject({
            hitScrollbar: true,
            hitResizer: false,
          })

        await expect
          .poll(
            async () =>
              await window.evaluate(id => {
                const api = window.__opencoveTerminalSelectionTestApi
                if (!api) {
                  return { ok: false as const, reason: 'missing test api' }
                }

                const size = api.getSize(id)
                if (!size) {
                  return { ok: false as const, reason: 'missing terminal size' }
                }
                const renderMetrics = api.getRenderMetrics(id)
                if (!renderMetrics?.cssCellWidth) {
                  return { ok: false as const, reason: 'missing render metrics' }
                }

                // Electron/Linux CI can land the lower-right interior cell center directly on the
                // scrollbar or resize-handle boundary because of subpixel rounding and overlay
                // hitboxes. Step one more cell inward on both axes so we still validate the
                // lower-right content area without depending on those borders.
                const targetCol = Math.max(size.cols - 2, 1)
                const targetRow = Math.max(size.rows - 2, 1)
                const center = api.getCellCenter(id, targetCol, targetRow)
                if (!center) {
                  return { ok: false as const, reason: 'missing cell center' }
                }

                const nodeElement = document.querySelector(
                  `.react-flow__node[data-id="${id}"] .terminal-node`,
                )
                if (!(nodeElement instanceof HTMLElement)) {
                  return { ok: false as const, reason: 'missing terminal node' }
                }

                const terminalSurface = nodeElement.querySelector('.terminal-node__terminal')
                const xtermElement = nodeElement.querySelector('.xterm')
                const viewportElement = nodeElement.querySelector('.xterm-viewport')
                const screenElement = nodeElement.querySelector('.xterm-screen')
                const rowElement = nodeElement.querySelector('.xterm-rows > div')
                const scrollbarElement = nodeElement.querySelector(
                  '.xterm-scrollable-element .scrollbar.vertical',
                )
                const resizers = Array.from(nodeElement.querySelectorAll('.terminal-node__resizer'))

                if (!(terminalSurface instanceof HTMLElement)) {
                  return { ok: false as const, reason: 'missing terminal surface' }
                }

                if (!(xtermElement instanceof HTMLElement)) {
                  return { ok: false as const, reason: 'missing xterm' }
                }

                if (!(viewportElement instanceof HTMLElement)) {
                  return { ok: false as const, reason: 'missing viewport' }
                }

                if (!(screenElement instanceof HTMLElement)) {
                  return { ok: false as const, reason: 'missing screen' }
                }

                if (!(rowElement instanceof HTMLElement)) {
                  return { ok: false as const, reason: 'missing row' }
                }

                const pointInsideRect = (
                  rect: DOMRect,
                  point: { x: number; y: number },
                  inset = 0,
                ): boolean => {
                  return (
                    point.x >= rect.left + inset &&
                    point.x <= rect.right - inset &&
                    point.y >= rect.top + inset &&
                    point.y <= rect.bottom - inset
                  )
                }

                const hitTarget = document.elementFromPoint(center.x, center.y)
                if (!hitTarget) {
                  return { ok: false as const, reason: 'missing hit target' }
                }
                const xtermStyle = window.getComputedStyle(xtermElement)
                const screenStyle = window.getComputedStyle(screenElement)
                const rowStyle = window.getComputedStyle(rowElement)
                const horizontalPadding =
                  (Number.parseFloat(xtermStyle.paddingLeft) || 0) +
                  (Number.parseFloat(xtermStyle.paddingRight) || 0)

                return {
                  ok: true as const,
                  size,
                  cssCellWidth: renderMetrics.cssCellWidth,
                  targetCol,
                  targetRow,
                  point: center,
                  tagName: hitTarget.tagName,
                  className: hitTarget instanceof HTMLElement ? hitTarget.className : '',
                  insideTerminalBounds: pointInsideRect(
                    terminalSurface.getBoundingClientRect(),
                    center,
                    0.5,
                  ),
                  terminalRightGutterPx:
                    terminalSurface.getBoundingClientRect().right -
                    screenElement.getBoundingClientRect().right,
                  screenOverflowX: screenStyle.overflowX,
                  screenOverflowY: screenStyle.overflowY,
                  rowOverflowX: rowStyle.overflowX,
                  rowOverflowY: rowStyle.overflowY,
                  xtermLayoutGutterPx:
                    Math.round(
                      (xtermElement.clientWidth - horizontalPadding - screenElement.clientWidth) *
                        100,
                    ) / 100,
                  insideViewportBounds: pointInsideRect(
                    viewportElement.getBoundingClientRect(),
                    center,
                    0.5,
                  ),
                  insideScreenBounds: pointInsideRect(
                    screenElement.getBoundingClientRect(),
                    center,
                    0.5,
                  ),
                  insideScrollbarBounds:
                    scrollbarElement instanceof HTMLElement
                      ? pointInsideRect(scrollbarElement.getBoundingClientRect(), center, 0.5)
                      : false,
                  insideResizerBounds: resizers.some(resizer =>
                    resizer instanceof HTMLElement
                      ? pointInsideRect(resizer.getBoundingClientRect(), center, 0.5)
                      : false,
                  ),
                  insideScrollbar:
                    hitTarget.closest('.xterm-scrollable-element .scrollbar.vertical') !== null,
                  insideResizer: hitTarget.closest('.terminal-node__resizer') !== null,
                  insideScreen: hitTarget.closest('.xterm-screen') !== null,
                  insideViewport: hitTarget.closest('.xterm-viewport') !== null,
                  insideTerminal: hitTarget.closest('.terminal-node__terminal') !== null,
                }
              }, nodeId),
            { timeout: 5_000 },
          )
          .toMatchObject({
            ok: true,
            insideScreenBounds: true,
            insideScrollbarBounds: false,
            insideResizerBounds: false,
            screenOverflowX: 'visible',
            screenOverflowY: 'visible',
            rowOverflowX: 'visible',
            rowOverflowY: 'visible',
          })
        await expect
          .poll(
            async () =>
              await window.evaluate(id => {
                const api = window.__opencoveTerminalSelectionTestApi
                const nodeElement = document.querySelector(
                  `.react-flow__node[data-id="${id}"] .terminal-node`,
                )
                const terminalSurface = nodeElement?.querySelector('.terminal-node__terminal')
                const xtermElement = nodeElement?.querySelector('.xterm')
                const screenElement = nodeElement?.querySelector('.xterm-screen')
                const overviewRulerElement = nodeElement?.querySelector(
                  '.xterm-decoration-overview-ruler',
                )
                const renderMetrics = api?.getRenderMetrics(id)
                if (
                  !(terminalSurface instanceof HTMLElement) ||
                  !(xtermElement instanceof HTMLElement) ||
                  !(screenElement instanceof HTMLElement) ||
                  !(overviewRulerElement instanceof HTMLElement)
                ) {
                  return null
                }
                const cssCellWidth = renderMetrics?.cssCellWidth
                if (typeof cssCellWidth !== 'number' || !Number.isFinite(cssCellWidth)) {
                  return null
                }
                const xtermStyle = window.getComputedStyle(xtermElement)
                const horizontalPadding =
                  (Number.parseFloat(xtermStyle.paddingLeft) || 0) +
                  (Number.parseFloat(xtermStyle.paddingRight) || 0)
                const xtermLayoutGutterPx =
                  Math.round(
                    (xtermElement.clientWidth - horizontalPadding - screenElement.clientWidth) *
                      100,
                  ) / 100

                return {
                  cssCellWidth,
                  terminalRightGutterPx:
                    Math.round(
                      (terminalSurface.getBoundingClientRect().right -
                        screenElement.getBoundingClientRect().right) *
                        100,
                    ) / 100,
                  xtermLayoutGutterPx,
                  overviewRulerWidth:
                    Math.round(overviewRulerElement.getBoundingClientRect().width * 100) / 100,
                }
              }, nodeId),
          )
          .toMatchObject({
            terminalRightGutterPx: expect.any(Number),
            xtermLayoutGutterPx: expect.any(Number),
          })
        await expect
          .poll(
            async () =>
              await window.evaluate(id => {
                const nodeElement = document.querySelector(
                  `.react-flow__node[data-id="${id}"] .terminal-node`,
                )
                const overviewRulerElement = nodeElement?.querySelector(
                  '.xterm-decoration-overview-ruler',
                )
                if (!(overviewRulerElement instanceof HTMLElement)) {
                  return null
                }

                return Math.round(overviewRulerElement.getBoundingClientRect().width * 100) / 100
              }, nodeId),
          )
          .toBeLessThan(0.5)
        await expect
          .poll(
            async () =>
              await window.evaluate(id => {
                const api = window.__opencoveTerminalSelectionTestApi
                const nodeElement = document.querySelector(
                  `.react-flow__node[data-id="${id}"] .terminal-node`,
                )
                const xtermElement = nodeElement?.querySelector('.xterm')
                const screenElement = nodeElement?.querySelector('.xterm-screen')
                const scrollbarElement = nodeElement?.querySelector(
                  '.xterm-scrollable-element .scrollbar.vertical',
                )
                const renderMetrics = api?.getRenderMetrics(id)
                if (
                  !(xtermElement instanceof HTMLElement) ||
                  !(screenElement instanceof HTMLElement) ||
                  !(scrollbarElement instanceof HTMLElement) ||
                  !renderMetrics?.cssCellWidth
                ) {
                  return null
                }
                const xtermStyle = window.getComputedStyle(xtermElement)
                const horizontalPadding =
                  (Number.parseFloat(xtermStyle.paddingLeft) || 0) +
                  (Number.parseFloat(xtermStyle.paddingRight) || 0)

                const gutter =
                  Math.round(
                    (xtermElement.clientWidth - horizontalPadding - screenElement.clientWidth) *
                      100,
                  ) / 100
                const cssCellWidth = renderMetrics.cssCellWidth
                const screenToScrollbarGapPx =
                  Math.round(
                    (scrollbarElement.getBoundingClientRect().left -
                      screenElement.getBoundingClientRect().right) *
                      100,
                  ) / 100

                return { gutterPx: gutter, cssCellWidth, screenToScrollbarGapPx }
              }, nodeId),
          )
          .toMatchObject({
            gutterPx: expect.any(Number),
            cssCellWidth: expect.any(Number),
            screenToScrollbarGapPx: expect.any(Number),
          })
        await expect
          .poll(
            async () =>
              await window.evaluate(id => {
                const api = window.__opencoveTerminalSelectionTestApi
                const nodeElement = document.querySelector(
                  `.react-flow__node[data-id="${id}"] .terminal-node`,
                )
                const xtermElement = nodeElement?.querySelector('.xterm')
                const screenElement = nodeElement?.querySelector('.xterm-screen')
                const scrollbarElement = nodeElement?.querySelector(
                  '.xterm-scrollable-element .scrollbar.vertical',
                )
                const renderMetrics = api?.getRenderMetrics(id)
                if (
                  !(xtermElement instanceof HTMLElement) ||
                  !(screenElement instanceof HTMLElement) ||
                  !(scrollbarElement instanceof HTMLElement) ||
                  !renderMetrics?.cssCellWidth
                ) {
                  return null
                }
                const xtermStyle = window.getComputedStyle(xtermElement)
                const horizontalPadding =
                  (Number.parseFloat(xtermStyle.paddingLeft) || 0) +
                  (Number.parseFloat(xtermStyle.paddingRight) || 0)
                const gutter =
                  Math.round(
                    (xtermElement.clientWidth - horizontalPadding - screenElement.clientWidth) *
                      100,
                  ) / 100

                const screenToScrollbarGapPx =
                  scrollbarElement.getBoundingClientRect().left -
                  screenElement.getBoundingClientRect().right

                return {
                  hasSafetyGap: gutter >= renderMetrics.cssCellWidth,
                  isTextCloseToScrollbar: screenToScrollbarGapPx <= renderMetrics.cssCellWidth * 2,
                }
              }, nodeId),
          )
          .toMatchObject({
            hasSafetyGap: true,
            isTextCloseToScrollbar: true,
          })
        await expect
          .poll(
            async () =>
              await window.evaluate(id => {
                const api = window.__opencoveTerminalSelectionTestApi
                const size = api?.getSize(id)
                const renderMetrics = api?.getRenderMetrics(id)
                const nodeElement = document.querySelector(
                  `.react-flow__node[data-id="${id}"] .terminal-node`,
                )
                const screenElement = nodeElement?.querySelector('.xterm-screen')
                if (
                  !size ||
                  !renderMetrics?.cssCellWidth ||
                  !(screenElement instanceof HTMLElement)
                ) {
                  return null
                }

                return (
                  Math.round(
                    (size.cols * renderMetrics.cssCellWidth - screenElement.clientWidth) * 100,
                  ) / 100
                )
              }, nodeId),
          )
          .toBeLessThanOrEqual(0)

        await expect
          .poll(
            async () =>
              await window.evaluate(id => {
                const api = window.__opencoveTerminalSelectionTestApi
                const metrics = api?.getRenderMetrics(id)
                if (!api || !metrics || metrics.baseY === null) {
                  return null
                }

                const targetLine = Math.max(0, metrics.baseY - 30)
                return api.scrollToLine(id, targetLine) ? api.getViewportY(id) : null
              }, nodeId),
            { timeout: 5_000 },
          )
          .toEqual(expect.any(Number))

        await expect
          .poll(
            async () =>
              await window.evaluate(id => {
                const metrics = window.__opencoveTerminalSelectionTestApi?.getRenderMetrics(id)
                if (
                  !metrics ||
                  metrics.baseY === null ||
                  metrics.viewportY === null ||
                  metrics.instanceId === null
                ) {
                  return null
                }

                return {
                  baseY: metrics.baseY,
                  viewportY: metrics.viewportY,
                  instanceId: metrics.instanceId,
                  offsetFromBottom: metrics.baseY - metrics.viewportY,
                }
              }, nodeId),
            { timeout: 5_000 },
          )
          .toMatchObject({
            baseY: expect.any(Number),
            viewportY: expect.any(Number),
            instanceId: expect.any(Number),
            offsetFromBottom: expect.any(Number),
          })
        const metricsBeforeZoom = await window.evaluate(id => {
          const metrics = window.__opencoveTerminalSelectionTestApi?.getRenderMetrics(id)
          if (
            !metrics ||
            metrics.baseY === null ||
            metrics.viewportY === null ||
            metrics.instanceId === null
          ) {
            return null
          }

          return {
            baseY: metrics.baseY,
            viewportY: metrics.viewportY,
            instanceId: metrics.instanceId,
            offsetFromBottom: metrics.baseY - metrics.viewportY,
          }
        }, nodeId)
        expect(metricsBeforeZoom).not.toBeNull()
        expect(metricsBeforeZoom!.viewportY).toBeLessThan(metricsBeforeZoom!.baseY)
        expect(metricsBeforeZoom!.offsetFromBottom).toBeGreaterThan(0)

        const zoomInButton = window.locator('.react-flow__controls-zoomin')
        await expect(zoomInButton).toBeVisible()
        const zoomBefore = (await readCanvasViewport(window)).zoom
        await zoomInButton.click()
        await expect
          .poll(async () => (await readCanvasViewport(window)).zoom, { timeout: 5_000 })
          .toBeGreaterThan(zoomBefore)
        await window.waitForTimeout(150)

        const rightResizer = node.locator('[data-testid="terminal-resizer-right"]')
        const rightResizerBox = await rightResizer.evaluate(element => {
          const rect = element.getBoundingClientRect()
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          }
        })
        await window.mouse.move(
          rightResizerBox.x + rightResizerBox.width / 2,
          rightResizerBox.y + rightResizerBox.height / 2,
        )
        await window.mouse.down()
        await window.mouse.move(
          rightResizerBox.x + rightResizerBox.width / 2 + 96,
          rightResizerBox.y + rightResizerBox.height / 2,
          {
            steps: 8,
          },
        )
        await window.mouse.up()

        await expect
          .poll(
            async () =>
              await window.evaluate(
                ({ id, instanceIdBeforeZoom }) => {
                  const metrics = window.__opencoveTerminalSelectionTestApi?.getRenderMetrics(id)
                  if (
                    !metrics ||
                    metrics.baseY === null ||
                    metrics.viewportY === null ||
                    metrics.instanceId === null
                  ) {
                    return false
                  }

                  return (
                    metrics.instanceId === instanceIdBeforeZoom && metrics.viewportY < metrics.baseY
                  )
                },
                {
                  id: nodeId,
                  instanceIdBeforeZoom: metricsBeforeZoom!.instanceId,
                },
              ),
            { timeout: 5_000 },
          )
          .toBe(true)

        await xterm.click()
        await expect(node.locator('.xterm-helper-textarea')).toBeFocused()
        await window.keyboard.type(
          buildNodeEvalCommand(`
            const lines = Array.from({ length: 120 }, (_, index) => 'OPENCOVE_REDRAW_' + index.toString().padStart(3, '0')).join('\\n')
            process.stdout.write('\\u001b[2J\\u001b[H' + lines + '\\n')
            setInterval(() => {}, 1000)
          `),
        )
        await window.keyboard.press('Enter')
        await expect(node).toContainText('OPENCOVE_REDRAW_119', { timeout: 20_000 })

        await expect
          .poll(
            async () =>
              await window.evaluate(id => {
                const api = window.__opencoveTerminalSelectionTestApi
                const metrics = api?.getRenderMetrics(id)
                return metrics?.viewportY === null || metrics?.baseY === null
                  ? null
                  : metrics.viewportY > 0 && metrics.viewportY >= metrics.baseY
              }, nodeId),
            { timeout: 5_000 },
          )
          .toBe(true)

        await expect
          .poll(
            async () =>
              await window.evaluate(id => {
                const api = window.__opencoveTerminalSelectionTestApi
                const size = api?.getSize(id)
                const renderMetrics = api?.getRenderMetrics(id)
                const nodeElement = document.querySelector(
                  `.react-flow__node[data-id="${id}"] .terminal-node`,
                )
                const screenElement = nodeElement?.querySelector('.xterm-screen')
                if (
                  !size ||
                  !renderMetrics?.cssCellWidth ||
                  !(screenElement instanceof HTMLElement)
                ) {
                  return null
                }
                const targetCol = Math.max(size.cols - 1, 1)
                const targetRow = Math.max(size.rows - 1, 1)
                const center = api?.getCellCenter(id, targetCol, targetRow)
                if (!center) {
                  return null
                }
                const target = document.elementFromPoint(center.x, center.y)

                return {
                  insideScreen: target?.closest('.xterm-screen') === screenElement,
                  screenOverflow:
                    Math.round(
                      (size.cols * renderMetrics.cssCellWidth - screenElement.clientWidth) * 100,
                    ) / 100,
                }
              }, nodeId),
            { timeout: 5_000 },
          )
          .toMatchObject({
            insideScreen: true,
            screenOverflow: expect.any(Number),
          })
      }

      await assertTerminalSurface('node-a', nodes.nth(0))
      await assertTerminalSurface('node-b', nodes.nth(1))
    } finally {
      await electronApp.close()
    }
  })
})
