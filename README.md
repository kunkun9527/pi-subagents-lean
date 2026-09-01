# @ssk_dev/pi-subagents-lean

> **Lean Pi subagents extension with full features: 268 initial tokens (81% lighter than original).**
> [See my full setup for Pi](https://github.com/kunkun9527/my-lean-pi-setup)

[简体中文](README.zh-CN.md)

A lightweight Pi wrapper for [`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents). It preserves the full upstream subagent engine while condensing all agent operations into a single, compact tool schema.

## Core Features

* Full upstream runtime: Keeps agent discovery, spawning, background execution, result retrieval, steering, and lifecycle handling untouched.
* Unified tool interface: Combines `Agent`, `get_subagent_result`, and `steer_subagent` under one `subagent` tool.
* Advanced options on demand: Detailed parameters and schemas remain accessible via `help` and JSON inputs without cluttering the default prompt.

This package does not strip down or rewrite the underlying engine; it only slims down the prompt footprint exposed to the model.

## Installation

```bash
pi install npm:@ssk_dev/pi-subagents-lean
```

Do not load this alongside another `pi-subagents` wrapper to avoid registering duplicate tools.

## Usage

The model interacts with a single tool:

```text
subagent
```

Supported operations include `run`, `result`, `steer`, and `help`.

```json
{
  "op": "run",
  "prompt": "Find the implementation of the cache key.",
  "description": "Locate cache key",
  "subagent_type": "Explore",
  "run_in_background": true
}
```

* Use `result` with `agent_id` to retrieve output from a finished task.
* Use `steer` with `agent_id` and `message` to redirect a running agent.
* Use `help` to inspect advanced upstream parameters when needed.

## Important: Review Your Agent Definitions

The upstream runtime automatically discovers built-in and custom agents across global, workspace, and project directories. This repository does not package your private agents, sessions, or memory, but it intentionally preserves that discovery mechanism.

After installation:

1. Review all discovered agent definitions and make sure each `model` field points to a model available in your environment.
2. Remove any agent types you do not need.
3. Adjust prompts, tools, and extension allowlists to match your workflow.
4. Check for naming collisions: a custom agent with the same name can override a built-in type depending on discovery precedence.

The upstream package includes built-in `general-purpose`, `Explore`, and `Plan` types. Your environment may load additional custom definitions.

## Context Footprint Benchmark

With only this extension enabled, its recurring initialization overhead in the model context is:

| Model-facing tool | Lean | Upstream `@tintinweb/pi-subagents@0.16.1` |
| --- | ---: | ---: |
| Facade / `Agent` | `subagent`: 268 | `Agent`: 1,111 |
| Result retrieval | Included in facade | `get_subagent_result`: 149 |
| Steering | Included in facade | `steer_subagent`: 156 |
| **Total** | **268** | **1,416** |

This saves **1,148 tokens (81.1%)** compared to the pinned upstream package.

The benchmark was measured on Pi 0.84.4 with `pi-context-view@0.4.3` in a fresh isolated session, excluding built-in tools, skills, context files, and unrelated extensions. Context View estimates tokens as `ceil(characters / 4)`. Pure runtime UI elements and slash commands are excluded as they are not sent to the model.

## Versions

Upstream runtime is pinned to `@tintinweb/pi-subagents@0.16.1`.

## Development

```bash
npm ci
npm run check
```

## License

MIT. This project wraps the MIT-licensed [`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents).