# DEVELOPMENT - 开发导航（Index）

本文档是本仓库的“开发入口/索引”。为避免一次性信息过载，详细规范已拆分到各模块目录下，请按需打开对应文档。

## 如何使用（给 Agent / 开发者）

1.  **每次任务先读本文件**：获取全局硬规则、文档地图与常用入口。
2.  **需要更深细节时**：参考 `AGENTS.md` 或 `docs/` 内的专题文档。

## 开发与测试指南

### 核心编码原则 (Core Coding Principles)

1.  **优先复用 (Prioritize Reuse)**: 在创建任何新代码、组件或工具函数之前，**必须**彻底搜索现有代码库以查找可复用组件。如无必要勿增实体，避免重复造轮子。
2.  **单一职责原则 (Single Responsibility Principle)**: 每个类、函数或模块都应只负责一项功能，保持高内聚。
3.  **保持简单 (KISS)**: 优先选择简单直接的解决方案，避免过度工程化。
4.  **不要重复自己 (DRY)**: 避免代码重复，通过抽象和复用提高代码质量。
5.  **小步迭代与持续验收 (Incremental Iteration & Continuous Acceptance)**: 主要功能必须拆分为独立可测试、可验收的步骤，确保小步快跑，频繁集成，并持续验证业务价值。
6.  **封装横切关注点 (Encapsulate Cross-Cutting Concerns)**: 如发现对于影响多个模块的通用功能（如IPC通信、日志、错误处理），应重构统一封装，避免在使用方重复实现。
7.  **组件逻辑内化 (Logic Internalization)**: 重构时，将分散在使用方的重复逻辑下沉到组件内部，实现组件自治，让组件自己管理自己的行为。
8.  **关注点分离 (Separation of Concerns)**: 将不同的职责分配到不同的模块（Main/Preload/Renderer），每个模块专注于一件事，降低耦合度。

## 全局硬规则（摘要）

-   **架构分层**：本项目为 Clean 架构
    -   **Main Process**：负责系统级操作、窗口管理、文件系统访问。
    -   **Preload**：安全桥接，暴露有限的 API 给渲染进程。
    -   **Renderer**：纯 UI 逻辑 (React 19 + Tailwind v4)，**严禁**直接调用 Node.js API。
-   **Small vs Large**（详见 `AGENTS.md`）：
    -   **Small**：直接做，小步快反馈，跑针对性验证。
    -   **Large / 运行时高风险**：必须先写 Spec（验收标准 + 风险点 + 验证命令）并等确认，再写 Plan 并等确认。
        -   **考虑整体复用 / 优化 / 重构设计**：复用优先，系统性视角，避免“顺手大重构”失控。
        -   **兼容与迁移**：改动 IPC 接口或数据结构时，必须考虑对现有功能的影响。
-   **禁止手改**：
    -   lock 文件 (`pnpm-lock.yaml`) 必须由命令生成/更新。
    -   生成代码（如自动生成的类型定义等）禁止手改。
-   **提交前检查（与 CI 对齐的最低门槛）**：
    -   执行 `pnpm check` (Type Check)
    -   执行 `pnpm lint:fix` (Oxlint)
    -   执行 `pnpm format:check` (Prettier)
    -   执行 `pnpm test -- --run` (Unit Tests)
-   **安全（Electron Security）**：
    -   始终开启 Context Isolation。
    -   Renderer 进程禁止开启 Node Integration。
    -   IPC 通信必须校验参数类型 (validate ALL inputs)。

## 快速开始

-   **安装依赖**：`pnpm install`
-   **启动开发环境**：`pnpm dev`
-   **运行单元测试**：`pnpm test -- --run`
-   **运行 E2E 测试**：`pnpm test:e2e`

## 文档地图（按问题找入口）

-   **Agent 行为准则与详细工作流**：`AGENTS.md` (The Single Source of Truth for Agents)
-   **架构标准（Clean + Feature-First）**：`docs/ARCHITECTURE.md`
-   **UI 开发标准**：
    -   窗口 UI 标准：`docs/WINDOW_UI_STANDARD.md`
    -   任务 UI 标准：`docs/TASK_UI_STANDARD.md`
    -   视口导航标准：`docs/VIEWPORT_NAVIGATION_STANDARD.md`
-   **终端渲染基准**：`docs/TERMINAL_TUI_RENDERING_BASELINE.md`
-   **调试指南**：`docs/DEBUGGING.md`
-   **贡献代码指南**：`CONTRIBUTING.md`
-   **API Client 生成与使用**：暂无，参考 `src/shared/ipc` 定义。

## 检索建议（避免一次性读完）

-   优先在 `AGENTS.md` 中查找开发及其流程规范。
-   涉及具体 UI/功能模块时，检索 `docs/` 下的相关文档。
-   搜索现有代码中的实现模式，遵循 "Prioritize Reuse" 原则。
