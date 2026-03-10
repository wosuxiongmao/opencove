import { defineConfig } from '@playwright/test'

// macOS 的 pointer / focus 语义在后台窗口模式下与前台窗口不一致。
// 默认让 Darwin 走 normal，对齐本地开发与 macOS CI；其他平台保持 offscreen。
// 可通过 OPENCOVE_E2E_WINDOW_MODE 覆盖：normal / inactive / offscreen / hidden。
const defaultE2EWindowMode = process.platform === 'darwin' ? 'normal' : 'offscreen'
process.env['OPENCOVE_E2E_WINDOW_MODE'] =
  process.env['OPENCOVE_E2E_WINDOW_MODE'] ?? defaultE2EWindowMode

/**
 * Playwright 配置 - Electron E2E 测试
 *
 * 使用 Electron 的 Playwright 集成来测试桌面应用。
 * 运行: npm run test:e2e
 */
export default defineConfig({
  // 测试目录
  testDir: './tests/e2e',

  // 测试文件匹配模式
  testMatch: '**/*.spec.ts',

  // 全局超时：每个测试 120 秒 (考虑 Electron 启动时间)
  timeout: 120_000,

  // expect 超时
  expect: {
    timeout: 15_000,
  },

  // CI 最多重跑一次，避免把确定性失配拖成更长的失败队列。
  retries: process.env.CI ? 1 : 0,

  // 并行 worker 数量
  workers: 1, // Electron 测试建议串行运行

  // 报告器
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  // 输出目录（截图、视频等）
  outputDir: './test-results',

  // 全局设置/清理
  globalSetup: undefined,
  globalTeardown: undefined,

  // 项目配置
  projects: [
    {
      name: 'electron',
      use: {
        // 截图配置
        screenshot: 'only-on-failure',
        // 视频录制
        video: 'retain-on-failure',
        // Trace 配置
        trace: 'retain-on-failure',
      },
    },
  ],
})
