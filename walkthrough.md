# OpenCove 工作记录

## 最近工作

> **格式规则**：索引表记录日期+摘要+关联变更，详情用 `## YYYY-MM-DD CHG-ID 摘要` 段落。
> 每次工作结束必须更新索引表和详情段落。

<!-- 详情示例：
## 2026-01-15 CHG-20260115-01 用户认证模块实现
> **追加时间**: 2026-01-15T18:30:00+08:00
- 执行 CHG-20260115-01: 用户认证模块
  - **T-001**: JWT 中间件实现（auth.js 新增 verifyToken 函数）
  - **T-002**: 登录/注册 API（routes/auth.js 新增 POST /login + /register）
- 验证结果：单元测试 12/12 通过，手动测试 login→token→protected-route 流程正常
- 附带修复：修正 package.json 缺少 jsonwebtoken 依赖声明
-->

**排列顺序**: 倒序（最新在前）

| 日期 | 完成内容 | 关联变更 |
|------|----------|----------|
| 2026-05-13 | Fix：resume agent session 后终端文字贴边 — 修正 geometry padding 常量 + hydration 后调度 overhang 检查 + 修复 scheduler 重入 | CHG-20260513-01 |
| 2026-05-13 | QA：解释 normal 状态下终端文字-滚动条间距不一致的根因（无代码改动） | QA-20260513-01 |

## 2026-05-13 CHG-20260513-01 Resume 终端文字贴边修复

> **追加时间**: 2026-05-13T12:30:00+08:00

- 执行 CHG-20260513-01: Fix Resume Terminal Text Edge Overflow
  - **T-041**: 修正 `TERMINAL_NODE_XTERM_HORIZONTAL_PADDING_PX` 常量 0→16（匹配 CSS `padding: 8px`）
  - **T-042**: 在 `hydrateTerminalFromSnapshot` 中新增 `onPresentationSnapshotGeometryApplied` 回调，snapshot 几何应用后调度 overhang 检查
  - **T-043**: 更新 `workspaceCanvas.constants.spec.ts` 5 处 cols 期望值（padding 常量变更导致减少 1-2）
  - **T-044**: 修复 overhang scheduler 重入问题 — `schedule()` 移除 `frameId !== null` guard，允许 `onHydrated` 在内容写入后重置 `remainingFrames`
- 根因：(1) padding 常量为 0 但 CSS 有 16px，cols 偏大；(2) scheduler 在内容写入前触发，`onHydrated` 触发时被 `frameId !== null` guard 跳过
- 验证结果：303 passed / 4 failed（预存失败），无新增回归

## 2026-05-13 QA-20260513-01 文字-滚动条间距差异根因分析

> **追加时间**: 2026-05-13T10:55:00+08:00

- 处理 QA-20260513-01: 解释为何不同终端节点在 normal 状态下文字到滚动条距离不一致
  - **T-Q1**: 代码路径调研
    - `src/contexts/workspace/presentation/renderer/components/terminalNode/syncTerminalNodeSize.ts:485-604`（`resolveDomRendererScrollbarGapSafeCols` / `resolveDomRendererSafeMeasuredSize`）
    - `src/app/renderer/styles/terminal-node.css:209-251`（`.xterm` padding=8px、滚动条样式）
    - `src/app/renderer/styles/terminal-node.webgl-layout.css`（DOM renderer overflow 覆盖）
  - **T-Q2**: 结论汇总（三项独立来源叠加）
    1. cols 计算 `floor((containerInner - 16px padding - scrollbarWidth) / cellWidth)` 的余数在 0~cellWidth 间，clientWidth 与亚像素 cellWidth 共同决定落点
    2. 安全缩列阈值 `DOM_RENDERER_SCROLLBAR_GAP_SAFETY_CELLS=1` / `DOM_RENDERER_GLYPH_SCROLLBAR_GAP_SAFETY_CELLS=2` 仅在 `hasVisibleTextOverhang`（syncTerminalNodeSize.ts:551）触发时砍 1 列；满字符/CJK 窗口被砍、空行历史窗口不被砍
    3. xterm DOM renderer 行内只渲染含字符的 span，末行字符数决定视觉文字右边界
  - **T-Q3**: 解释"缩放后一致"现象 — resize 流程强制重测 + 安全缩列在统一信号下收敛
- 验证：未修改任何代码，未运行测试；本轮交付的是分析回答而非补丁

<!-- ARCHIVE -->

<!-- 历史工作记录归档到此处，格式示例：

## 2026-01-15 CHG-20260115-01 用户认证模块实现

> **追加时间**: 2026-01-15T18:30:00+08:00

- 执行 CHG-20260115-01: 用户认证
  - **T-001**: JWT 中间件实现
  - **T-002**: 登录/注册 API
  - 验证：单元测试 12/12 通过
-->
