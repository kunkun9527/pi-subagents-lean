# pi-subagents-lean

[中文](#中文) · [English](#english)

## 中文

`pi-subagents-lean` 是 [`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents) 的轻量 Pi 包装层。它保留上游子代理运行时，把 `Agent`、`get_subagent_result` 和 `steer_subagent` 收拢为一个小 schema；详细参数通过 `help` 按需查看。

### 模型可见工具

- `subagent`

`subagent` 的 `op` 为 `run`、`result`、`steer` 或 `help`。运行时默认 agent 定义来自上游包内置的 `general-purpose`、`Explore` 和 `Plan`。

本仓库**不包含**任何安装者的自定义 agent 文件、项目 `.pi/agents`、会话记录或 memory。上游运行时仍可能按安装者自己的 Pi 配置扫描自定义 agents；这由上游负责，不会被本仓库打包进去。

### 安装

```bash
pi install git:github.com/kunkun9527/pi-subagents-lean
```

不要和原版 `pi-subagents` wrapper 同时加载，以免重复注册子代理工具。

### 开发

```bash
npm ci
npm run check
```

上游依赖固定为 `@tintinweb/pi-subagents@0.16.1`。

## English

`pi-subagents-lean` is a small Pi wrapper around [`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents). It preserves the upstream subagent runtime while routing `Agent`, `get_subagent_result`, and `steer_subagent` through one small schema; complete operation parameters are available on demand through `help`.

It exposes one model-facing tool, `subagent`, with `op` values `run`, `result`, `steer`, and `help`. The upstream package supplies the built-in `general-purpose`, `Explore`, and `Plan` agent definitions.

This repository ships **no installer-specific custom agent files**, project `.pi/agents`, sessions, or memory. The upstream runtime may still scan custom agents from the installing user's own Pi configuration; that behavior belongs to upstream and is not packaged here.

Install:

```bash
pi install git:github.com/kunkun9527/pi-subagents-lean
```

Do not load another `pi-subagents` wrapper at the same time, or the subagent tools may be registered twice.

Validate locally with `npm ci && npm run check`.

## License

MIT. This project is a wrapper around the MIT-licensed `@tintinweb/pi-subagents` project.
