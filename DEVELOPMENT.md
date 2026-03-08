# DEVELOPMENT - 开发导航（Index）

本文档是本仓库的“开发入口/索引”。为避免一次性信息过载，详细规范已拆分到各模块目录下，请按需打开对应文档。

## 如何使用（给 Agent / 开发者）

1.  **每次任务先读本文件**：获取全局硬规则、文档地图与常用入口。
2.  **需要更深细节时**：参考 `AGENTS.md` 或 `docs/` 内的专题文档。

## 开发与测试指南

### 核心编码原则 (Core Coding Principles)

只保留最容易在日常开发中被忽略、但一旦忽略就容易形成系统性问题的原则：

1.  **优先复用 (Prioritize Reuse)**: 在创建任何新代码、组件或工具函数之前，**必须**彻底搜索现有代码库以查找可复用组件。如无必要勿增实体，避免重复造轮子。
2.  **明确状态所有权 (State Ownership)**: 对会被持久化、恢复、同步或跨层传播的状态，必须明确唯一 owner 与 single source of truth。多个写入口默认视为设计风险。
3.  **边界内聚，副作用靠边 (Keep Boundaries Clean)**: `Main / Preload / Renderer / external CLI` 各司其职。状态决策不要跨层泄漏，IO / IPC / 文件系统等副作用尽量收敛在边界层。
4.  **封装横切关注点 (Encapsulate Cross-Cutting Concerns)**: IPC、日志、错误处理、watcher、persistence coordination 等横切逻辑要统一收口，避免调用方各自实现一份。
5.  **重复行为优先下沉到拥有者 (Logic Internalization)**: 若同一行为在多个调用方重复出现，优先下沉到真正拥有该行为的组件/模块，而不是在使用方复制。
6.  **把 SOLID 当作校准器，不当作教条 (Use SOLID as a Design Check)**:
    - `S`：模块如果同时承担状态决策、IO、UI、恢复策略，通常已经拆分过晚。
    - `O`：新增 `provider / adapter / watcher` 时，优先新增实现，而不是到处改稳定分发逻辑。
    - `L`：只有存在真实子类型替换时才考虑；不要为了“像 OO”强造继承层级。
    - `I`：`preload / service / bridge` 接口要小而专用，不暴露大而全 API。
    - `D`：高层依赖抽象端口和类型，不直接依赖 `Electron / PTY / CLI` 细节。
7.  **Renderer 反馈统一用应用内消息，不用系统弹窗 (Use In-App Feedback, Not System Dialogs)**: Renderer 层禁止新增 `window.alert / confirm / prompt` 这类系统弹窗；统一复用应用内反馈组件，并按语义区分 `info / warning / error` 三个视觉层级，避免阻塞交互与平台观感割裂。

### 架构执行触发器 (Architecture Execution Triggers)

只保留最容易在代码演化中失控、且最值得前置约束的触发器：

1.  **先分离决策与编排**：状态迁移/业务判定属于 owner；`IO / IPC / CLI / watcher` 调用属于 orchestration。一个函数若同时承担两者，默认应先拆分。
2.  **出现以下组合时，先拆再改**：
    - 同一文件出现两个以上独立变更原因。
    - 同一函数同时包含 `状态判定 + 外部调用 + fallback/retry + 写回`。
    - 同一次改动同时触及 `lifecycle / persistence / hydration / resume / watcher` 中两项及以上。
3.  **高风险路径先写不变量**：启动、恢复、关闭、重试、fallback、异步乱序相关改动，先写 `1-3` 条 invariant，再决定实现位置与测试层级。

### 高风险问题预防策略（只列最容易漏的）

1.  **先写状态/所有权表，再写流程**：对跨 `Main / Preload / Renderer / PTY / persistence / external CLI` 的改动，先明确四列：`state`、`owner`、`write entry`、`restart source of truth`。若同一真相存在多个写入口，默认高风险。
2.  **严格区分四类状态**：
    - `用户意图`：用户明确要求的结果（如 stop、resume、close、archive）。
    - `持久化事实`：重启/恢复逻辑依赖的 durable source of truth。
    - `运行时观测`：进程、watcher、IPC、fallback 当前上报了什么。
    - `UI 派生展示`：仅用于显示的即时状态。
    - 规则：短暂的运行时观测不得直接覆盖恢复所依赖的持久化事实，除非有明确业务规则和回归测试。
3.  **优先验证不变量，不堆场景**：每个高风险改动至少先写出 1-3 条不变量。测试优先证明“哪些错误不会发生”，而不是只证明 happy path 能跑通。
4.  **默认过一遍故障模型**：重点考虑 `await` 中途关闭窗口/退出 app、事件重复/乱序/延迟、fallback 或 cleanup 比 happy path 更早写状态、部分成功/部分失败、旧数据恢复，以及跨平台路径/shell/权限差异。
5.  **测试按风险层分配，不按文件平均分配**：
    - `Unit`：状态迁移、normalize、纯逻辑不变量。
    - `Contract`：IPC payload、跨层边界、输入校验。
    - `Integration`：hydration、persistence、restart、lifecycle、watcher 协作。
    - `E2E`：只覆盖关键用户路径，不替代前三级。
    - 触及 `lifecycle / persistence / IPC / external session watcher / async concurrency` 的 PR，至少要有一条跨边界回归测试。
6.  **每个真实 bug 都要资产化**：至少沉淀为以下之一：回归测试、运行时断言、文档规则、抽象收敛。同类 bug 第二次出现时，优先升维修模型/抽象，不再只补局部 patch。

## 全局硬规则（摘要）

-   **架构基线**：本项目以 `DDD` 划分领域，以 `Clean` 约束依赖；`context` 是一级组织单位，每个 context 强制拆为 `domain / application / infrastructure / presentation`，`app/main`、`app/preload`、`app/renderer` 只做组合与边界。细则见 `docs/ARCHITECTURE.md`。
-   **Small vs Large**（详见 `AGENTS.md`）：
    -   **Small**：直接做，小步快反馈，跑针对性验证。
    -   **Large / 运行时高风险**：遵循 **Spec -> (Feasibility Check) -> Plan** 流程。
        -   **高风险触发器（最易漏）**：启动/重启恢复、hydration、持久化写回、退出生命周期、跨层状态同步、external CLI / watcher 回写、fallback/cleanup 改写状态、多写者共享同一真相。
        -   **Spec**：明确验收标准、风险点及验证手段，等待确认。
        -   **Feasibility Check**：针对新技术/高性能/核心重构，必须先调研并跑通 PoC。
        -   **Plan**：制定详细执行计划，等待确认。
        -   **验证**：UI 变更需提供截图/录屏；重大功能需跑通 E2E。
        -   **兼容与迁移**：改动 IPC 接口或数据结构时，必须考虑对现有功能的影响。
        -   **跨平台兼容**：开发默认应考虑 `macOS / Windows / Linux` 三平台；如本次只支持部分平台，必须在方案与交付说明中明确标注差异、限制与后续补齐计划。
-   **禁止手改**：
    -   lock 文件 (`pnpm-lock.yaml`) 必须由命令生成/更新。
    -   生成代码（如自动生成的类型定义等）禁止手改。
-   **提交前检查（与 CI 对齐的最低门槛）**：
    -   运行 `pnpm pre-commit` 前，必须先 `git add` 本次改动，再执行 `pnpm line-check:staged`，因为行数门禁只检查 staged 文件。
    -   若 staged 文件中存在超过 500 行的文件，先重构/拆分，过门禁后再继续，不要带着超长文件直接运行 `pnpm pre-commit`。
    -   通过上述检查后，再执行 `pnpm pre-commit` （type, lint, format, test）。
-   **测试失败排查前置**：
    -   凡遇到 `pnpm pre-commit`、`pnpm test -- --run`、`pnpm test:e2e` 或单独 `Playwright` 用例失败，继续排查前**必须先阅读** `docs/DEBUGGING.md`。
-   **安全（Electron Security）**：
    -   始终开启 Context Isolation。
    -   Renderer 进程禁止开启 Node Integration。
    -   IPC 通信必须校验参数类型 (validate ALL inputs)。

## 快速开始

-   **安装依赖**：`pnpm install`
-   **启动开发环境**：`pnpm dev`
    - 默认使用独立的 `userData` 目录（避免污染已安装版本的数据）
    - 如需临时复用已安装包的数据：`COVE_DEV_USE_SHARED_USER_DATA=1 pnpm dev` 或 `pnpm dev -- --shared-user-data`
    - 如需自定义 dev 的数据目录：`COVE_DEV_USER_DATA_DIR=/path/to/userData pnpm dev`
-   **运行单元测试**：`pnpm test -- --run`
-   **运行 E2E 测试**：`pnpm test:e2e`
    -   说明：`pnpm test:e2e` 已包含构建步骤，默认使用 `offscreen` 后台窗口模式；检测到 Electron 崩溃特征时，会按窗口模式链路自动降级并重跑失败用例（例如 `hidden -> offscreen`、`offscreen -> inactive`）。
    -   可通过 `COVE_E2E_WINDOW_MODE` 指定窗口模式（`normal / inactive / offscreen / hidden`）。
    -   如需关闭自动降级，可设置 `COVE_E2E_DISABLE_CRASH_FALLBACK=1`。
    -   若需单独执行 Playwright（如 `pnpm exec playwright test tests/e2e/xxx.spec.ts`），必须先执行 `pnpm build`，否则可能仍会使用旧的 `out/` 产物，导致结果与当前源码不一致。

## 文档地图（按问题找入口）

-   **Agent 行为准则与详细工作流**：`AGENTS.md` (The Single Source of Truth for Agents)
-   **架构标准（DDD + Clean）**：`docs/ARCHITECTURE.md`
-   **完全重构计划**：`docs/REFACTOR_PLAN.md`
-   **恢复模型与 owner 表**：`docs/RECOVERY_MODEL.md`
-   **持久化（SQLite schema / migrations）**：`docs/PERSISTENCE.md`
-   **UI 开发标准**：
    -   窗口 UI 标准：`docs/WINDOW_UI_STANDARD.md`
    -   任务 UI 标准：`docs/TASK_UI_STANDARD.md`
    -   视口导航标准：`docs/VIEWPORT_NAVIGATION_STANDARD.md`
-   **终端渲染基准**：`docs/TERMINAL_TUI_RENDERING_BASELINE.md`
-   **调试指南**：`docs/DEBUGGING.md`
-   **贡献代码指南**：`CONTRIBUTING.md`
-   **API Client 生成与使用**：暂无，参考 `src/shared/contracts` 定义。

## 检索建议（避免一次性读完）

-   优先在 `AGENTS.md` 中查找开发及其流程规范。
-   涉及具体 UI/功能模块时，检索 `docs/` 下的相关文档。
-   搜索现有代码中的实现模式，遵循 "Prioritize Reuse" 原则。
