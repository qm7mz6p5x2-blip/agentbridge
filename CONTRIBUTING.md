# Contributing

感谢参与 AgentBridge。

## 开发流程

1. Fork 仓库并创建功能分支。
2. 修改代码并补充测试。
3. 至少运行语法检查和相关集成测试。
4. 提交 Pull Request，并说明变更目的、测试方式和兼容性影响。

## 代码要求

- 不提交 API Key、Cookie、Token、个人路径和用户记忆。
- 工具执行代码必须包含权限或输入校验。
- 新增工具需要提供名称、描述、参数结构和执行逻辑。
- 修改工具调用协议时，必须同步更新解析器、提示词和文档。

## 提交信息

推荐使用清晰的动词开头，例如：

```text
add tool permission profiles
fix plugin tool argument handling
docs: document local execution flow
```
