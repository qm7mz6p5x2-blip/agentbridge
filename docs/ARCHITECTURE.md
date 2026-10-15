# AgentBridge Architecture

AgentBridge 的核心是 `Model + Harness`：

- Model 负责理解任务并决定下一步。
- Harness 负责把模型文本转换为受控的本地工具调用，并驱动结果回填。
- Tool Server 负责权限检查、工具查找和真实执行。

## 组件

```text
Edge / Chrome Extension
  |
  | 1. inject tool prompt
  | 2. capture model output
  | 3. parse <tool_call>
  v
Executor / Background
  |
  | POST /exec
  v
AgentBridge Tool Server
  |
  +-- PermissionPolicy
  +-- AuditLog
  +-- ToolRegistry
  |     +-- built-in tools
  |     +-- plugin tools
  |     +-- MCP tools
  v
workspace files and approved local commands
```

## Turn 与 Step

```text
Turn = 一次完整用户任务
Step = 一次模型请求、工具执行和结果回填
```

一个 Turn 可以包含多个 Step：

```text
list_dir(memory)
  -> list_dir(config)
  -> read_file(personality.json)
  -> final response
```

当模型不再输出 `<tool_call>` 时，Turn 结束。

## 工具调用流程

```text
1. 用户发送任务。
2. 模型输出 <tool_call name="...">JSON</tool_call>。
3. 扩展解析工具名称和参数。
4. Executor 请求 POST /exec。
5. 服务端执行权限策略。
6. ToolRegistry 查找工具。
7. 工具 execute 函数执行真实操作。
8. 审计日志记录脱敏摘要、耗时和结果。
9. 扩展包装 <tool_response> 并发送回模型。
10. 模型继续下一步或输出最终回答。
```

## 权限策略

权限策略支持三种模式：

| 模式 | 行为 |
|---|---|
| `auto` | 直接执行 |
| `manual` | 需要用户确认 |
| `off` | 禁止执行 |

默认策略位于 `workspace/config/permissions.json`。写入文件和插件安装默认需要确认。

## 审计日志

审计日志位于：

```text
workspace/audit/tool-audit.jsonl
```

日志对以下内容进行脱敏：

- API Key、Token、密码和 Cookie。
- 文件正文只记录长度，不记录完整内容。
- 命令和路径会限制最大长度。

相关接口：

```text
GET  /api/audit
GET  /api/audit/stats
POST /api/audit        { "action": "clear" }
GET  /api/permissions
POST /api/permissions  { "tool": "write_file", "mode": "manual" }
```

## 插件 SDK

插件通过 `api.registerTool()` 注册工具。最小结构：

```js
module.exports = function register(api) {
  api.registerTool(function () {
    return [{
      name: "example_tool",
      description: "Example tool",
      parameters: { type: "object", properties: {}, required: [] },
      execute: async function () {
        return JSON.stringify({ success: true });
      }
    }];
  });
};
```

使用 SDK 生成：

```powershell
npm run plugin:create -- sample-plugin --name "Sample Plugin" --tool sample_hello
```

## 可靠性控制

- 相同工具和参数去重。
- 单任务最大 Step 限制。
- 同一工具连续失败熔断。
- 任务状态持久化到 localStorage。
- 工具调用超时保护。
- 浏览器扩展与 HTTP 回退连接。

## 安全边界

- 工作区路径解析和禁止路径检查。
- 危险命令拦截。
- 敏感操作确认。
- 工具参数清洗。
- 浏览器扩展 Origin 白名单。
- 不提交日志、记忆、个人路径和凭据。
