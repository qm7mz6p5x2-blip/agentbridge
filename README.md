# AgentBridge

AgentBridge 是一个面向网页版大模型的本地工具执行与 Agent 循环框架。它让模型可以基于对话输出结构化的工具调用，由浏览器扩展解析后发送到本地 Node.js 服务端执行，再把结果自动回填给模型，形成多步任务闭环。

本项目是基于 [AI Tool Agent](https://github.com/lsy2009/ai-tool-agent) 修改的衍生版本，原项目采用 MIT License。原始版权与许可证声明已保留。

## 核心能力

- 浏览器扩展：支持 Microsoft Edge 和 Chrome 的 Manifest V3。
- 本地工具服务：Node.js 服务监听 `localhost:3004`，统一执行工具。
- 工具调用解析：把模型输出的 `<tool_call>` 转换为结构化对象。
- 结果回填：把执行结果包装为 `<tool_response>` 自动发送回对话。
- Agent Loop：支持多步工具链、最大步数、调用去重和连续失败熔断。
- 工具注册：统一管理内置工具、插件工具和 MCP 工具。
- 安全控制：路径检查、危险命令拦截、敏感操作确认和参数净化。
- 插件扩展：扫描 `workspace/plugins` 并注册插件提供的工具。
- 本地优先：默认运行在用户电脑上，不依赖云端执行环境。
- 审计日志：记录工具、结果、耗时和脱敏参数，默认不保存文件正文和敏感字段。
- 权限策略：支持 `auto`、`manual`、`off` 三种工具权限模式。
- 人工审批队列：手动模式会生成待审批请求，可允许一次、始终允许或拒绝。
- 插件权限清单：插件必须声明文件、网络和子进程能力。

## 架构

```text
Edge/Chrome Extension
        |
        v
Service Worker / Executor
        |
        v
POST http://localhost:3004/exec
        |
        v
ToolRegistry
  |-- built-in tools
  |-- plugin tools
  `-- MCP tools
        |
        v
workspace files and approved local commands
```

## 快速开始

### 1. 安装依赖

需要 Node.js 18 或更高版本。

```powershell
npm install
```

### 2. 启动本地服务

```powershell
npm run launcher
```

也可以双击：

```text
start-server.bat
```

服务启动后监听：

```text
http://localhost:3004
```

### 3. 加载浏览器扩展

Microsoft Edge：

```text
edge://extensions
```

Google Chrome：

```text
chrome://extensions
```

打开开发者模式，选择“加载解压缩的扩展”，然后选择本仓库根目录。

首次加载后，在 `edge://extensions` 或 `chrome://extensions` 中复制扩展 ID，并启动服务前设置：

```powershell
$env:AGENTBRIDGE_EXTENSION_IDS="你的扩展ID"
npm run launcher
```

多个扩展 ID 可以用逗号分隔。不要把本机扩展 ID 提交到仓库。

### 4. 在 DeepSeek 中启用工具

1. 打开支持的工具页面。
2. 按 `Ctrl+Shift+D` 打开快捷面板。
3. 点击“一键启动（工具+记忆）”。
4. 等待工具提示词注入完成。
5. 发送需要访问本地文件或执行工具的任务。

## 当前验证结果

在 Microsoft Edge 和 DeepSeek 网页版中，已经验证以下链路：

```text
AI 输出工具调用
  -> 扩展解析
  -> POST /exec
  -> ToolRegistry 执行
  -> 返回 JSON
  -> 结果回填
  -> AI 继续回答
```

当前服务端注册 52 个工具，加载 8 个插件。

## 审计与权限

工具执行后会写入 `workspace/audit/tool-audit.jsonl`。日志包含：

- 工具名称
- 权限模式
- 成功或失败
- 执行耗时
- 脱敏后的参数摘要
- 错误信息

相关接口：

```text
GET  /api/audit
GET  /api/audit/stats
POST /api/audit         { "action": "clear" }
GET  /api/approvals?status=pending
POST /api/approvals     { "id": "...", "action": "approve", "remember": false }
POST /api/approvals     { "id": "...", "action": "deny", "reason": "用户拒绝" }
GET  /api/permissions
POST /api/permissions   { "tool": "read_file", "mode": "manual" }
POST /api/permissions   { "defaultMode": "manual" }
POST /api/permissions   { "enforce": false }
```

默认策略下，写入文件和插件安装需要用户确认；读取和目录查询默认自动执行。策略文件位于 `workspace/config/permissions.json`。

## 创建插件

使用插件 SDK 生成一个可加载的最小插件：

```powershell
npm run plugin:create -- sample-plugin --name "Sample Plugin" --tool sample_hello
```

命令会在 `workspace/plugins/sample-plugin/` 下生成：

```text
plugin.json
index.js
README.md
```

随后重启服务或在扩展中调用 `plugin_reload`，插件工具即可注册到 ToolRegistry。

插件清单需要声明权限：

```json
{
  "permissions": {
    "filesystem": true,
    "network": false,
    "child_process": false
  }
}
```

未声明 `network` 的插件无法加载 `http` 或 `https`；未声明
`child_process` 的插件无法执行子进程。文件系统访问仍然受 workspace
沙箱限制。

## 项目结构

```text
manifest.json                浏览器扩展清单
src/                         扩展源码
  core/                      解析器、执行器、循环控制
  monitor/                   对话状态监控和结果回填
  platforms/                 AI 平台适配器
  ui/                        扩展面板
server/                      本地 Node.js 服务端
workspace/plugins/          插件目录
workspace/skills/           技能目录
```

更完整的组件、权限和调用链说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
演示步骤和录屏脚本见 [docs/DEMO.md](docs/DEMO.md)。

## 安全说明

AgentBridge 可以执行本地文件和命令操作。请只在了解风险的情况下授权工具调用，并保持工作区权限最小化。

本项目通过注入脚本与第三方 AI 平台交互，可能受到对应平台服务条款约束。使用者需要自行评估和承担相关风险。

## 来源与致谢

AgentBridge 基于以下原项目修改：

- [AI Tool Agent](https://github.com/lsy2009/ai-tool-agent)
- 原始版权：Copyright (c) 2025 lsy200409

原项目的 MIT License 完整保留在 [LICENSE](LICENSE) 中，修改说明见 [NOTICE](NOTICE)。

原项目 README 中提到的参考项目包括：

- [openclaw-zero-token](https://github.com/linuxhsj/openclaw-zero-token)
- [DeepSeek++](https://github.com/zhu1090093659/deepseek-pp)
- [CLI-Anything](https://github.com/HKUDS/CLI-Anything)

## 许可证

MIT License。原项目版权和许可证声明必须保留。
