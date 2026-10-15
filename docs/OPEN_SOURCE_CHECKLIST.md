# AgentBridge 开源准备清单

## 结论

原项目 `AI Tool Agent v0.2.0-full` 使用 MIT License。

MIT 允许：

- 使用
- 复制
- 修改
- 合并
- 发布
- 分发
- 再授权
- 出售

但分发时必须保留原版权声明和 MIT License。

原声明：

```text
Copyright (c) 2025 lsy200409
```

建议项目名：

```text
AgentBridge
网页大模型本地工具执行与 Agent 循环框架
```

## 必须保留

发布到 GitHub 时保留：

- 原 `LICENSE` 文件。
- 原版权声明 `Copyright (c) 2025 lsy200409`。
- 原项目来源链接。
- 原 `DISCLAIMER.md`，可在此基础上补充你自己的免责声明。

新增 `NOTICE` 文件：

```text
AgentBridge

Copyright (c) 2026 [你的姓名或 GitHub 用户名]

This project is a modified derivative of AI Tool Agent:
https://github.com/lsy2009/ai-tool-agent

Original work Copyright (c) 2025 lsy200409
Original project is licensed under the MIT License.

The original MIT License is preserved in the LICENSE file.
```

## GitHub 发布前必须清理

不要直接提交完整的本地运行目录。

排除：

- `runtime/nodejs/`
- `node_modules/`
- `server/logs/`
- `workspace/sessions/`
- `workspace/memory/`
- `workspace/config/` 中的个人配置和记忆
- `.env`、API Key、Token、Cookie
- 本机绝对路径
- 本机浏览器扩展 ID
- 本地测试日志和截图

建议 `.gitignore`：

```gitignore
runtime/
node_modules/
server/logs/
workspace/sessions/
workspace/memory/
.env
*.log
*.tmp
.DS_Store
```

## 品牌和仓库改名

需要统一修改：

- GitHub 仓库名
- `README.md` 项目名
- `manifest.json` 的 `name` 和 `description`
- `package.json` 的 `name`、`description`、`license`
- 扩展面板标题
- 服务端启动横幅
- 日志前缀
- 文档中的旧项目链接

不要删除原作者信息，只把它移动到“来源与致谢”部分。

## 建议实际魔改方向

只改名字不算真正魔改，建议至少完成以下 3 类改动：

1. 增加可验证的工程质量
   - 为解析器补单元测试。
   - 为 `/exec` 补 HTTP 集成测试。
   - 增加 GitHub Actions。
   - 修复插件工具参数传递问题并加测试。

2. 增加差异化功能
   - 工具权限中心：自动、确认、禁止三种模式。
   - 执行审计面板：记录工具、参数、结果、耗时。
   - 插件 SDK：提供模板和一键创建脚本。
   - 工具市场清单：从 JSON 清单加载工具。

3. 改善开源体验
   - 提供 Windows、macOS、Linux 安装文档。
   - 提供截图和架构图。
   - 增加 `CONTRIBUTING.md`、`SECURITY.md`。
   - 提供 Release 压缩包和验证步骤。

## Git 初始化建议

```powershell
git init
git add .
git commit -m "Initial AgentBridge derivative release"
git branch -M main
git remote add origin https://github.com/[你的用户名]/agentbridge.git
git push -u origin main
```

## 当前状态

- GitHub 用户名：`qm7mz6p5x2-blip`。
- 仓库名：`agentbridge`。
- 许可证：保留 MIT。
- 第一版范围：轻量衍生版本，已完成品牌、脱敏、测试和 CI。
- 本地仓库：`D:\agent\agentbridge`。
- 远程地址：`https://github.com/qm7mz6p5x2-blip/agentbridge.git`。
