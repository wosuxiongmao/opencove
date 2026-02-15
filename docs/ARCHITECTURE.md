# Cove Architecture (Clean + Feature-First)

本文档定义 Cove 的目标架构与“不可违反”的工程约束，用于保证长期整洁、可维护、可扩展（为未来插件系统/市场预留扩展点，但本轮不实现插件功能）。

---

## 0) 目标与非目标

### 目标（Goals）
- **长期可维护**：新增能力不靠“继续堆在一个巨文件里”，而是自然落在对应模块。
- **复利开发**：复用优先，跨模块共享通过稳定契约（contracts）与可测试的 usecase 实现。
- **安全边界清晰**：Electron 三进程边界严格；IPC 输入必校验；渲染层不接触 Node。
- **可演进**：未来引入插件/市场时，不需要重写核心架构，只需新增模块与适配器。

### 非目标（Non-goals）
- 本文档不规定具体 UI 视觉（见 `docs/*_UI_STANDARD.md`）。
- 本文档不要求本轮立即落地插件系统，只定义“未来可扩展的接口与分层方式”。

---

## 1) 一句话总览（TL;DR）

**进程边界是第一层（Main / Preload / Renderer / Shared），每个进程内部按 Feature（模块）垂直切片，再在模块内按 Clean 分层。**

这样可以同时满足：
- Electron 安全与构建入口清晰（进程边界不混）；
- 业务可维护性与复利（feature-first）；
- 插件扩展点自然生长（模块化 + 合同化契约）。

---

## 2) 基础术语

- **Process Boundary**：`main` / `preload` / `renderer` 的天然隔离边界。
- **Module / Feature**：围绕一个业务能力的垂直切片（如 `pty` / `agent` / `workspace` / `task` / `settings`）。
- **Contract**：跨进程/跨模块稳定契约（IPC channel、payload、错误码、事件定义）。
- **Usecase（应用层）**：不依赖 UI、不依赖 Electron API 的业务编排逻辑；只依赖“端口（ports）”。
- **Adapter（基础设施层）**：对接 Electron/Node/OS 的实现（PTY、FS、窗口、网络等）。

---

## 3) 不可妥协的硬规则（Invariants）

### 3.1 安全与进程边界
- Renderer **禁止**直接调用 Node/Electron API；只能通过 `window.coveApi`（来自 preload）与 `@shared` 的契约类型交互。
- Preload 只暴露“白名单 API”；不暴露通用 `ipcRenderer` 或任意执行能力。
- Main 端 IPC **必须**对所有入参做 runtime 校验（不信任 renderer/插件代码）。

### 3.2 依赖方向（Clean Dependency Rule）
- **内层不依赖外层**：`domain` ← `application` ← `infrastructure` ← `ipc/ui`（依赖只允许向外）
- `@shared/contracts/*` 允许被任意层引用，但它只能承载“稳定契约”，不得包含具体实现逻辑。

### 3.3 可维护性（文件与模块）
- **单文件行数上限：500 行**（仓库检查脚本已存在）。超限必须拆分。
- 每个模块必须有清晰的 **public API**（`index.ts`），跨模块引用只能从 public API 入口导入。
- 禁止把“业务编排 + IO（IPC/持久化/订阅）+ UI”塞进一个 React 组件或一个 IPC 文件。

---

## 4) 目录结构（目标形态）

> 说明：保留 `src/main|preload|renderer|shared`，这是 Electron 的安全/构建现实；在其内部进行 feature-first + clean layering。

### 4.1 `src/shared`（稳定契约 + 跨端类型）
推荐新增（或演进到）：
```
src/shared/
  contracts/
    pty.ts
    agent.ts
    task.ts
    workspace.ts
    plugins.ts        # 仅契约预留（未来）
  errors/
    ipc.ts            # ErrorCode/Result 约定
  constants/
  types/
```

**规则**：
- `contracts/*` 只放：channel、输入/输出类型、事件类型、error code、版本号（如 `apiVersion`）。
- 不放：Electron/Node 实现；不放 React；不放“业务流程”。

### 4.2 `src/main`（系统能力 + 用例 + IPC）
```
src/main/
  app/                # Electron 启动、窗口生命周期、组合根
  ipc/
    index.ts          # IPC 组合根：注册各模块 handlers
  modules/
    pty/
      application/    # Usecases（纯编排）
      infrastructure/ # 适配 Node/Electron/OS（node-pty, fs...）
      ipc/            # 仅 handlers + payload 校验 + 错误映射
      index.ts
    agent/
    task/
    workspace/
    plugins/          # 预留：PluginHost/Registry/Permission（未来）
```

### 4.3 `src/preload`（安全桥接）
```
src/preload/
  api/
    pty.ts
    agent.ts
    task.ts
    workspace.ts
    plugins.ts        # 预留（未来）
  index.ts            # exposeInMainWorld + 聚合导出
  index.d.ts
```

### 4.4 `src/renderer`（UI + Store + Usecase + Adapter）
```
src/renderer/src/
  app/                # 组合根：AppShell、路由、Provider
  modules/
    workspace/
      ui/
      store/
      usecases/
      adapters/
      index.ts
    settings/
    task/
    agent/
    plugins/          # 预留（未来）
  shared-ui/          # 跨模块 UI 组件（纯展示）
  shared-kits/        # 通用 utils/hooks（与业务无关）
  styles/             # CSS 分拆（按主题/组件域）
```

---

## 5) 分层职责（每个模块内部的 Clean 模板）

> 并非所有模块都必须从一开始就拥有 `domain`；但必须有明确的 `application/usecases` 与 `adapters/infrastructure` 分离，避免 IO/编排/展示纠缠。

### 5.1 Domain（可选）
- 纯数据结构、纯计算规则（无副作用、无 IO）。
- 例：节点布局算法、标签过滤、任务状态机规则。

### 5.2 Application / Usecases（必须）
- 编排多个端口（ports）完成一个用户意图（如“启动 agent 并创建节点并订阅输出”）。
- 只依赖接口与 contract 类型，不依赖 Electron/React。
- 例：`LaunchAgentAndAttachTerminal`、`RestoreWorkspaceRuntimeSessions`。

### 5.3 Infrastructure / Adapters（必须）
- 对接 Node/Electron：PTY、FS、窗口、网络、数据库等。
- 保持可替换：未来插件/市场可能要求 mock、沙盒、权限门控。

### 5.4 IPC / UI（边界层）
- IPC：只做入参校验、调用 usecase、映射 `Result/Error`。
- UI：只做展示与事件转发；状态由 store/usecase 驱动；禁止在组件里堆长流程。

---

## 6) IPC 设计标准（强制）

### 6.1 契约收口
- 每个 IPC 通道必须在 `src/shared/contracts/<module>.ts` 定义：
  - channel 名称（常量）
  - request/response 类型
  - event 类型（如 `pty:data`）
  - error code（如 `PTY_SESSION_NOT_FOUND`）

### 6.2 入参校验（Main 强制）
Main 必须假设 renderer（以及未来插件）会传入任意数据：

- 每个 `ipcMain.handle(channel, handler)` 必须对 payload 做 runtime 校验（类型守卫/手写 normalize/或引入 schema 库）。
- 校验失败：返回统一错误（见 6.3），不得直接 `throw` 未处理错误导致主进程崩溃。
- 校验逻辑必须可复用：优先放到 `src/main/modules/<module>/ipc/validate*.ts`，避免每个 handler 复制粘贴。

> 建议：中长期引入一个轻量 schema（如 zod/valibot）来减少手写 normalize 的维护成本；但契约位置仍在 `src/shared/contracts/*`。

### 6.3 错误模型（跨 IPC 统一）
IPC 返回值必须“可序列化 + 可判定 + 可展示”：

- 推荐统一返回：
  - `Ok<T> = { ok: true; value: T }`
  - `Err = { ok: false; code: string; message: string; details?: unknown }`
- Main 内部可以抛异常，但必须在 IPC 边界捕获并映射为 `Err`。
- Renderer 不处理 `Error` 对象（不可稳定序列化）；只处理 `Err.code/message`。

### 6.4 事件与订阅（PTY/流式输出）
- 事件通道（如 `pty:data/pty:exit/pty:done`）必须定义在 `contracts`，并在 preload 暴露 `onXxx(listener) => unsubscribe`。
- Main 需要维护订阅生命周期（webContents destroyed 时自动清理），避免内存泄漏与“给已销毁窗口发送消息”。
- 不建议默认“广播给所有窗口”；优先根据订阅关系路由事件，减少性能与信息泄露风险。

---

## 7) Renderer 架构（UI 纯化 + 用例下沉）

### 7.1 组合根（Composition Root）
- `src/renderer/src/app/*` 负责：
  - 组装模块 UI（AppShell、路由、布局）
  - 注入依赖（真实 adapter、mock adapter、feature flags）
  - 全局样式与错误边界

### 7.2 模块内结构（建议）
以 `workspace` 模块为例：
- `ui/`：React 组件（展示/交互），不直接做长流程 IO。
- `store/`：zustand store（状态机/派生状态/选择器），是 UI 的单一数据源。
- `usecases/`：把“用户意图”变成可测试函数（可被 store 调用）。
- `adapters/`：唯一允许触碰 `window.coveApi` 的位置（如 `ipcClient.ts`）。

### 7.3 Renderer 端的依赖反转
usecase 不应直接 import `window.coveApi`，而是依赖端口接口：
```
interface PtyPort { spawn(...): Promise<...>; onData(...): Unsubscribe }
```
真实实现由 `adapters/ipcClient` 提供；测试用 fake/mock 提供。

### 7.4 并发与“异步间隙安全”（必做）
- 所有异步链路必须支持取消/忽略过期结果：
  - UI unmount 后不得 setState
  - 快速重复点击需要 latest-only/sequence token/AbortController
- store/usecase 内集中管理订阅的创建与释放：
  - attach/detach、onData/onExit 的 unsubscribe 必须可追踪
  - workspace 切换时必须批量清理资源

---

## 8) Main 架构（模块化 + 可释放资源）

### 8.1 模块化入口
- `src/main/ipc/index.ts` 作为 IPC 组合根，只负责：
  - 初始化每个模块的 handler（`registerPtyHandlers(register)`）
  - 汇总 dispose（关闭应用时统一清理）
- 每个模块独立维护自身资源（PTY sessions、watchers、timers）。

### 8.2 资源生命周期（强制）
- 任何 `watcher/timer/child process` 都必须纳入可释放集合：
  - 模块返回 `dispose()`（或实现 `Disposable`）
  - `app.before-quit` 与 `window-all-closed` 必须触发清理
- 禁止在主进程长期持有“无 owner 的全局 Map/Set”而没有清理策略。

### 8.3 Electron 安全默认值（目标）
- `contextIsolation: true`（必须）
- `nodeIntegration: false`（必须）
- `sandbox: true`（目标；如果确有不兼容，必须在 ADR 记录原因与替代防护）

---

## 9) Preload 架构（白名单 API + 单点暴露）

- `src/preload/index.ts` 只做：
  - 组合各模块 API：`coveApi = { pty, agent, task, workspace, ... }`
  - `contextBridge.exposeInMainWorld('coveApi', coveApi)`
- 每个模块 API 文件只做 `ipcRenderer.invoke/on/removeListener` 的薄封装：
  - 入参类型来自 `@shared/contracts/*`
  - 事件监听必须返回 unsubscribe

---

## 10) 横切关注点（Cross-Cutting）

### 10.1 持久化（Local-first）
- 当前可先维持 localStorage，但必须通过 `PersistencePort` 抽象，不允许 UI 到处 `localStorage.getItem/setItem`。
- 若未来迁移 sqlite（better-sqlite3/drizzle）：
  - 把它作为 Main 的基础设施能力
  - Renderer 通过 IPC 调用 repository/usecase（不要在 renderer 直接连 DB）

### 10.2 日志与错误观测
- Main：统一 logger（至少支持 level + 前缀 + 可关闭）；不要散落 `process.stderr.write`。
- Renderer：统一 toast/notice 的错误展示入口；不要在各处拼接 error message。

### 10.3 配置与测试注入
- 所有“测试专用开关”必须可审计、可关闭：
  - 通过 env 注入（如 `COVE_TEST_WORKSPACE`）或 adapter 注入
  - 禁止把测试逻辑扩散到业务核心

---

## 11) 测试策略（防回归的复利）

### 11.1 分层测试
- Unit：usecase/domain/store 的纯逻辑测试（快、稳定、覆盖主逻辑）。
- Integration：main 模块对基础设施的薄集成（如 SessionFileResolver）。
- E2E：只覆盖关键用户路径；优先用“seed 状态 + reload”保证确定性。

### 11.2 测试代码同样遵守 500 行
- `tests/e2e/*` 按场景拆分，不允许单文件无限增长。
- 提炼共享 helper：`tests/e2e/fixtures/*`、`tests/e2e/helpers/*`。

### 11.3 质量门禁（建议执行顺序）
- 快速：`pnpm test -- --run`
- UI 回归：`pnpm test:e2e`
- 交付前：`pnpm pre-commit`

---

## 12) 插件系统预览（仅为未来扩展预留）

> 本轮不实现插件功能；本节只定义“未来不会推翻的扩展点形态”，避免今天的架构把未来锁死。

### 12.1 插件视角的扩展点（Contributions）
未来插件可能贡献：
- Commands：新增命令（菜单/快捷键/面板按钮）
- Panels：新增侧边栏/设置页签/信息面板
- Canvas Nodes：新增节点类型（渲染 + 行为）
- Task Providers：任务生成/标题建议/标签策略

### 12.2 权限模型（必须从 Day 0 预留）
插件被视为不可信输入源，能力必须显式声明并由 Host 校验：
- 文件系统读写、网络访问、启动子进程、访问 workspace 路径、访问剪贴板等
- 插件 API 必须基于 capability（最小权限）设计，而不是暴露全量 `coveApi`

### 12.3 版本化契约
- `PluginApiVersion` 与 `contracts` 版本要独立演进；
- 允许 deprecate，但必须保留兼容窗口期与迁移指南。

---

## 13) 迁移落地建议（从当前代码到目标架构）

推荐按“机械拆分 → 边界收口 → 用例下沉 → 扩展点预留”推进：

1. **机械拆分**：先把所有超 500 行文件拆分成模块内子文件（零行为变化）。
2. **契约收口**：把 IPC channel/payload/Result 统一迁到 `src/shared/contracts/*`，Main 全通道入参校验。
3. **Renderer 用例下沉**：把长流程从 React 组件迁到 store/usecase，`window.coveApi` 收敛到 adapters。
4. **插件预留**：只新增 `contracts/plugins.ts` 与 main/renderer/preload 的空模块骨架（不实现安装/加载）。

每一步都必须以 `pnpm test -- --run` + 相关 E2E 用例作为验收，最后跑 `pnpm pre-commit`。
