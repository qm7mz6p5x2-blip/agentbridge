# Changelog

## 0.2.0

- Add persistent tool execution audit logs.
- Add backend permission policy with auto, manual, and off modes.
- Add `/api/audit`, `/api/audit/stats`, and `/api/permissions` endpoints.
- Add plugin SDK scaffolding command.
- Add plugin capability declarations for filesystem, network, and child processes.
- Add a persistent approval queue for manual tool requests.
- Add audit filtering and CSV export.
- Add tests for audit logs, permission policy, and plugin scaffolding.
- Add architecture documentation for the Model plus Harness design.
- Move native messaging identity to `com.agentbridge.native`.
- Add GitHub Actions syntax checks and tests.

## 0.1.0

- 基于 AI Tool Agent v0.2.0 创建 AgentBridge 衍生版本。
- 保留原始 MIT License 和版权声明。
- 增加来源说明、安全策略和贡献指南。
- 移除本地运行环境、用户记忆和会话数据。
- 准备作为独立 GitHub 开源仓库维护。
