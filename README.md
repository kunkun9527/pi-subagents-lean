# pi-subagents-lean

[简体中文](README.zh-CN.md)

A token-lean Pi facade over [`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents). It keeps the complete upstream subagent runtime and routes its provider-facing operations through one compact schema.

## What it keeps

- Upstream subagent discovery, spawning, background execution, result retrieval, steering, rendering, and lifecycle behavior.
- The upstream `Agent`, `get_subagent_result`, and `steer_subagent` operations behind one `subagent` facade.
- Full advanced parameters through on-demand `help` and JSON input.

This package does **not** replace the upstream runtime with a minimal implementation. It only reduces the persistent model-facing tool surface.

## Install

```bash
pi install git:github.com/kunkun9527/pi-subagents-lean
```

Do not load it together with another `pi-subagents` wrapper, or subagent tools may be registered twice.

## Use

The model sees one tool:

```text
subagent
```

Supported operations are `run`, `result`, `steer`, and `help`.

```json
{
  "op": "run",
  "prompt": "Find the implementation of the cache key.",
  "description": "Locate cache key",
  "subagent_type": "Explore",
  "run_in_background": true
}
```

Use `result` with `agent_id` to inspect a completed run and `steer` with `agent_id` plus `message` to redirect a running agent. Use `help` for advanced upstream parameters.

## Important: review your agent definitions

The upstream runtime can discover built-in agents and custom agents from global, workspace, and project Pi locations. This repository does not ship your private agents, sessions, or memory, but it intentionally preserves that upstream discovery behavior.

After installation:

1. Inspect every discovered agent definition and set its `model` to a provider/model available in your Pi environment.
2. Delete agent types you do not want.
3. Rename or modify agent types, prompts, tools, and extension lists to match your workflow.
4. Check duplicate names: a custom agent with the same name may override a built-in type depending on upstream discovery precedence.

The upstream package includes built-in `general-purpose`, `Explore`, and `Plan` definitions; your installation may expose additional custom types.

## Versions

The upstream runtime is pinned to `@tintinweb/pi-subagents@0.16.1`.

## Development

```bash
npm ci
npm run check
```

## License and upstream

MIT. This project wraps the MIT-licensed [`@tintinweb/pi-subagents`](https://github.com/tintinweb/pi-subagents).