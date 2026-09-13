# @ssk_dev/pi-subagents-lean

<!-- token-benchmark:summary:start -->
> **Token benchmark: Lean 268, upstream `@tintinweb/pi-subagents@0.19.0` 8,540 — 96.9% fewer.**
<!-- token-benchmark:summary:end -->
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

Supported operations include `run`, `result`, `steer`, `workflow`, and `help`.

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

<!-- token-benchmark:benchmark:start -->
With only this extension enabled, its recurring model-facing initialization contribution is:

| Variant | Tool and prompt contribution | Total |
| --- | --- | ---: |
| Lean `@ssk_dev/pi-subagents-lean@0.19.0` | `subagent` (268) | **268** |
| Upstream `@tintinweb/pi-subagents@0.19.0` | `Agent` (2,563) + `SubagentWorkflow` (5,611) + `get_subagent_result` (183) + `steer_subagent` (183) | **8,540** |

This saves **8,272 tokens (96.9%)**.
Measured with Pi 0.85.1 in separate temporary processes with empty configuration. Built-in tools, skills, context files, messages, unrelated extensions, runtime UI, and slash commands are excluded. Tokens use `ceil(characters / 4)`.
<!-- token-benchmark:benchmark:end -->

## Versions

Upstream runtime is pinned to `@tintinweb/pi-subagents@0.19.0`.

## Development

```bash
npm ci
npm run check
```

## License

MIT. This project wraps the MIT-licensed [`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents).