# pi-subagents-lean

[English](README.md)

[`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents) 的 token 精简版 Pi facade。它保留完整的上游 subagent 运行时，并通过一个紧凑 schema 路由面向模型的操作。

## 保留的能力

- 上游的 subagent 发现、启动、后台执行、结果获取、steering、渲染和生命周期行为。
- 通过一个 `subagent` facade 提供上游 `Agent`、`get_subagent_result` 和 `steer_subagent` 操作。
- 通过按需 `help` 和 JSON input 使用完整高级参数。

本包**不会**用最小化实现替换上游运行时，只减少长期存在的模型可见工具表面。

## 安装

```bash
pi install git:github.com/kunkun9527/pi-subagents-lean
```

不要同时加载另一个 `pi-subagents` 包装层，否则 subagent 工具可能被重复注册。

## 使用

模型只看到一个工具：

```text
subagent
```

支持的操作为 `run`、`result`、`steer` 和 `help`。

```json
{
  "op": "run",
  "prompt": "Find the implementation of the cache key.",
  "description": "Locate cache key",
  "subagent_type": "Explore",
  "run_in_background": true
}
```

使用带 `agent_id` 的 `result` 查看已完成任务；使用带 `agent_id` 和 `message` 的 `steer` 调整运行中的 agent。高级上游参数通过 `help` 查看。

## 重要：检查你的 agent 定义

上游运行时可以从全局、workspace 和项目 Pi 位置发现内置及自定义 agents。本仓库不会携带你的私有 agents、sessions 或 memory，但会有意保留这种上游发现行为。

安装后：

1. 检查每个被发现的 agent 定义，将其 `model` 设置为你的 Pi 环境中可用的供应商/模型。
2. 删除你不需要的 agent 类型。
3. 按工作流重命名或修改 agent 类型、提示词、工具和扩展列表。
4. 检查重名：根据上游发现优先级，同名自定义 agent 可能覆盖内置类型。

上游包包含内置 `general-purpose`、`Explore` 和 `Plan` 定义；你的安装还可能暴露其他自定义类型。

## 版本

上游运行时固定为 `@tintinweb/pi-subagents@0.16.1`。

## 开发

```bash
npm ci
npm run check
```

## 许可证与上游

MIT。本项目包装了采用 MIT 许可证的 [`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents)。