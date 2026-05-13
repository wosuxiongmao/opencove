# 实施计划

> **项目名称**: opencove
> **创建时间**: 2026-05-13T12:00:00+08:00
> **最后更新**: 2026-05-13T12:00:00+08:00

---

## 变更索引

- [x] CHG-20260513-02 Fix createTerminalNodeAtFlowPosition display metrics passthrough — 透传 terminalDisplayMetrics 参数修复测试 #change [tasks:: T-045]
- [x] CHG-20260513-01 Fix Resume Terminal Text Edge Overflow — 修正终端几何计算 padding 常量 + hydration 后调度 overhang 检查 + 修复 scheduler 重入问题 + 更新测试期望值 #change [tasks:: T-041~T-044]

---

## 活跃变更详情

（无活跃变更）

<!-- ARCHIVE -->

### CHG-20260513-02 Fix createTerminalNodeAtFlowPosition display metrics passthrough

**背景（Why）**：`createTerminalNodeAtFlowPosition` 函数未接收 `terminalDisplayMetrics` 参数，导致 display calibration metrics 无法透传到 `resolveTerminalPtyGeometryForNodeFrame`，测试期望 calibrated geometry 但实际使用 base geometry。

**范围（What）**：
- 1 个文件改动
- `useInteractions.paneNodeCreation.ts` — 新增 `terminalDisplayMetrics` 参数并透传

**技术决策（How）**：
- 在函数签名中新增可选参数 `terminalDisplayMetrics?: TerminalPtyGeometryDisplayMetrics | null`
- 透传到 `resolveTerminalPtyGeometryForNodeFrame` 的 `displayMetrics` 字段

**任务分解**：
- **T-045 修复参数透传**：`useInteractions.paneNodeCreation.ts:34-78` — 新增参数 + import + 透传到 geometry 计算

### CHG-20260513-01 Fix Resume Terminal Text Edge Overflow

**背景（Why）**：Resume agent session 后终端文字贴边（无 padding），缩放后恢复正常。根因是 `terminalPtyGeometry.ts` 中 `TERMINAL_NODE_XTERM_HORIZONTAL_PADDING_PX = 0`，但 CSS 实际有 `padding: 8px`（16px 水平），导致 cols 计算偏大 3-5 列。同时 `hydrateTerminalFromSnapshot` 在写入 presentation snapshot 后未调度 overhang 检查，溢出无法自动修正。

**范围（What）**：
- 5 个文件改动
- `terminalPtyGeometry.ts` — 修正常量 0→16
- `hydrateFromSnapshot.ts` — 新增 `onPresentationSnapshotGeometryApplied` 回调
- `runtimeHydrationStarter.ts` — 透传回调参数
- `useTerminalRuntimeSession.ts` — 传入 overhang scheduler.schedule
- `syncTerminalNodeSize.ts` — schedule() 移除 frameId guard，允许重置 remainingFrames

**技术决策（How）**：
- 直接修正常量值 0→16，匹配 CSS `padding: 8px`（border-box 下 8×2=16）
- 在 `hydrateTerminalFromSnapshot` 新增 `onPresentationSnapshotGeometryApplied` 回调，在 snapshot 几何应用后触发，让调用方调度 overhang 检查
- 修改 overhang scheduler 的 schedule() 方法，移除 `frameId !== null` 的 guard，允许在 scheduler 已运行时重置 remainingFrames，确保 onHydrated 触发时 scheduler 能在内容写入后重新等待 2 帧再执行 overhang 检查

**任务分解**：
- **T-041 修正 padding 常量**：`terminalPtyGeometry.ts:4` — 0→16
- **T-042 调度 overhang 检查**：`hydrateFromSnapshot.ts` + `runtimeHydrationStarter.ts` + `useTerminalRuntimeSession.ts` — 新增回调链路
- **T-043 更新测试期望值**：`workspaceCanvas.constants.spec.ts` — cols 期望值减少 1-2（padding 常量变更导致）
- **T-044 修复 scheduler 重入**：`syncTerminalNodeSize.ts` — schedule() 移除 frameId guard，允许重置 remainingFrames
