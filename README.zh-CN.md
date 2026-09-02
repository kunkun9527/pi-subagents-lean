# @ssk_dev/pi-subagents-lean

> **Pi Subagents 精简版扩展，保留全部功能，仅需 268 初始化 Token，相比原版减少 81%。**
> **完整配置参考：** [查看 Pi Lean Setup](https://github.com/kunkun9527/my-lean-pi-setup)

[English](README.md)

基于 [`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents) 的精简封装。在完整保留上游 Subagent 功能与运行时的同时，将所有操作收束为一个紧凑的工具接口，显著降低上下文占用。

## 核心特性

* 完整保留上游能力：包括 Agent 发现、后台派生运行、结果获取、动态引导（Steering）以及完整的生命周期管理。
* 统一工具入口：将原版的 `Agent`、`get_subagent_result` 与 `steer_subagent` 整合为单个 `subagent` 工具。
* 按需加载高级参数：复杂参数和完整 Schema 仅在调用 `help` 或传入 JSON 时展开，不再默认常驻于 Prompt 中。

本扩展并未简化或重写核心逻辑，而是仅对提供给模型的 Prompt 工具描述进行了深度精简。

## 安装

```bash
pi install npm:@ssk_dev/pi-subagents-lean
```

请勿与其它 `pi-subagents` 包装扩展同时加载，以防重复注册工具。

## 使用方法

模型仅会看到一个工具：

```text
subagent
```

支持的操作包括 `run`、`result`、`steer` 和 `help`。

```json
{
  "op": "run",
  "prompt": "Find the implementation of the cache key.",
  "description": "Locate cache key",
  "subagent_type": "Explore",
  "run_in_background": true
}
```

* 使用 `result` 搭配 `agent_id` 查看已完成任务的输出结果。
* 使用 `steer` 搭配 `agent_id` 与 `message` 调整正在运行中的 Agent。
* 使用 `help` 按需查看上游高级参数配置。

## 重要提醒：检查 Agent 定义配置

上游运行时会自动扫描全局、工作区及项目目录中的内置与自定义 Agent。本仓库不包含任何私有 Agent、会话或记忆配置，但完整继承了这一发现机制。

安装完成后建议：

1. 检查扫描到的所有 Agent 定义，确保其 `model` 字段指向你当前环境中可用的模型。
2. 移除不需要的 Agent 类型。
3. 根据个人工作流调整 Prompt、工具绑定及扩展白名单。
4. 注意命名冲突：同名的自定义 Agent 可能会根据优先级覆盖内置类型。

原版自带 `general-purpose`、`Explore` 和 `Plan` 三种预设，你的环境可能会额外加载其他自定义类型。

## 初始化上下文占用对比

单独启用本扩展时，注入到模型初始上下文中的 Token 占用实测如下：

| 模型可见工具 | Lean 精简版 | 原版 `@tintinweb/pi-subagents@0.16.1` |
| --- | ---: | ---: |
| Facade / `Agent` | `subagent`: 268 | `Agent`: 1,111 |
| 结果获取 | 已收敛至统一工具中 | `get_subagent_result`: 149 |
| 任务引导 (Steering) | 已收敛至统一工具中 | `steer_subagent`: 156 |
| **合计** | **268** | **1,416** |

相比固定版本的上游扩展，初始开销减少了 **1,148 tokens（81.1%）**。

测试环境为 Pi 0.84.4 与 `pi-context-view@0.4.3` 独立会话，排除了 Pi 内置工具、Skills、上下文文件与无关扩展。Context View 按 `ceil(字符数 / 4)` 估算。未计入不会发送给模型的纯运行时 UI 与 Slash 命令。

## 版本说明

上游运行时锁定为 `@tintinweb/pi-subagents@0.16.1`。

## 本地开发

```bash
npm ci
npm run check
```

## 开源协议与致谢

MIT 协议。本项目封装自采用 MIT 协议的 [`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents)。