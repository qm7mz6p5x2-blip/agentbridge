# Demo Guide

这份演示脚本用于 GitHub README、录屏和面试现场演示。演示目标是证明三件事：

1. AI 能通过扩展调用本地工具。
2. 写入类工具会进入人工审批。
3. 每次调用都会进入审计日志。

## 演示准备

1. 启动本地服务：

```powershell
cd "D:\agent\agentbridge"
npm run launcher
```

2. 在 Edge 打开 `edge://extensions`，确认 AgentBridge 已加载。

3. 打开 DeepSeek，新建对话并关闭深度思考。

4. 按 `Ctrl+Shift+D`，点击“一键启动”，等待工具提示词注入完成。

5. 清空审计和审批测试数据：

```powershell
$base='http://127.0.0.1:3004'
Invoke-RestMethod "$base/api/audit" -Method Post -ContentType 'application/json' -Body '{"action":"clear"}'
Invoke-RestMethod "$base/api/approvals" -Method Post -ContentType 'application/json' -Body '{"action":"clear"}'
```

## 演示 1：只读工具

在 DeepSeek 主聊天框发送：

```text
先列出工作区 config 目录，再读取 personality.json，
最后告诉我文件中的 name 和 traits.style。不要修改文件。
```

预期过程：

```text
list_dir(memory)
list_dir(config)
read_file(personality.json)
最终回答：name 和 traits.style
```

重点展示：

- 工具调用卡片。
- `读取/目录` 操作自动执行。
- 最终回答基于真实本地结果。

## 演示 2：人工审批

在 DeepSeek 发送：

```text
在工作区创建 demo/hello.txt，内容为 AgentBridge demo，
然后读取这个文件确认内容。不要修改其他文件。
```

预期过程：

```text
write_file 被权限策略拦截
扩展显示审批窗口
选择“允许一次”或“始终允许”
工具执行成功
read_file 读取并确认
```

重点展示：

- 写入类工具默认需要审批。
- 审批通过后才会真正执行。
- 拒绝时不会产生文件。

## 演示 3：审计面板

按 `Ctrl+Shift+D`，点击“审计”页签。

展示：

- 总调用次数。
- 成功和失败次数。
- 平均耗时。
- 工具名、权限模式、脱敏参数和错误。
- CSV 导出按钮。

## 录屏与 GIF

Windows 可以使用：

- `Win + G`：录制 MP4 演示视频。
- ScreenToGif：录制并导出 GIF。

建议参数：

```text
分辨率：1440x900 或 1280x720
帧率：15 FPS
时长：45 到 90 秒
GIF 大小：尽量小于 10 MB
```

录制顺序：

```text
服务启动
-> 一键启动
-> 只读工具调用
-> 写入审批
-> 审计面板
-> 导出 CSV
```

## 放到 README

把 GIF 放到：

```text
docs/assets/demo.gif
```

在 README 的“核心能力”后添加：

```markdown
![AgentBridge demo](docs/assets/demo.gif)
```

## 面试现场讲解顺序

1. 问题：网页版模型不能直接访问本地文件。
2. 架构：Model + Harness + Tool Server。
3. 链路：`tool_call -> parser -> /exec -> ToolRegistry -> tool_response`。
4. 安全：权限策略、审批队列、workspace 沙箱、危险命令拦截。
5. 可观察性：审计日志、统计、筛选和导出。
6. 扩展性：插件权限清单和插件 SDK。
