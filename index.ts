// pi-subagents-lean: one provider-facing facade over the full subagents runtime.
// Complete operation schemas stay local and are disclosed through help on demand.
import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import subagents from "@tintinweb/pi-subagents/src/index.ts";
import { Text } from "@earendil-works/pi-tui";

type CapturedTool = ToolDefinition<any, any, any>;
type UpstreamExtension = (pi: ExtensionAPI) => void;
type FacadeOperation = "run" | "result" | "steer" | "help";

const FACADE_PARAMETERS = Type.Object({
  op: Type.Unsafe<FacadeOperation>({
    type: "string",
    enum: ["run", "result", "steer", "help"],
  }),
  prompt: Type.Optional(Type.String({ description: "Task for run." })),
  description: Type.Optional(Type.String({ description: "3-5 word UI label for run." })),
  subagent_type: Type.Optional(
    Type.String({ description: "general-purpose, Explore, Plan, or a custom agent type." }),
  ),
  run_in_background: Type.Optional(Type.Boolean()),
  agent_id: Type.Optional(Type.String()),
  message: Type.Optional(Type.String()),
  input: Type.Optional(Type.String({ description: "JSON object string for advanced parameters." })),
});

function capturePi(pi: ExtensionAPI, tools: Map<string, CapturedTool>): ExtensionAPI {
  return new Proxy(pi, {
    get(target, property, receiver) {
      if (property === "registerTool") {
        return (tool: CapturedTool) => {
          tools.set(tool.name, tool);
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function renderParams(params: Record<string, unknown>): Record<string, unknown> {
  const { op: _op, input, ...common } = params;
  if (typeof input !== "string" || !input) return common;
  try {
    const parsed = JSON.parse(input) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? { ...(parsed as Record<string, unknown>), ...common }
      : common;
  } catch {
    return common;
  }
}

export function createSubagentsFacade(
  upstream: UpstreamExtension = subagents,
): (pi: ExtensionAPI) => void {
  return (pi: ExtensionAPI): void => {
    const tools = new Map<string, CapturedTool>();
    upstream(capturePi(pi, tools));

    const facadeTool: ToolDefinition<typeof FACADE_PARAMETERS, any, any> = {
      name: "subagent",
      label: "Subagent",
      description: "Launch, inspect, or steer a subagent. Use help for advanced parameters.",
      parameters: FACADE_PARAMETERS,
      promptGuidelines: [
        "run requires prompt, description (3-5 words), and subagent_type; use a matching agent for broad work, and direct tools when the target is known.",
        "Put advanced options in input as a JSON object; direct fields override duplicate JSON keys. result uses agent_id; steer uses agent_id and message. Use help only when advanced parameters are unclear.",
        "Background completion is notified; never poll or sleep. Summarize results and verify claimed code changes.",
      ],
      renderCall(args, theme, context) {
        const routed = renderParams(args);
        const toolName = args.op === "result"
          ? "get_subagent_result"
          : args.op === "steer"
            ? "steer_subagent"
            : "Agent";
        const target = tools.get(toolName);
        if (target?.renderCall) {
          return target.renderCall(routed, theme, { ...context, args: routed });
        }
        return new Text(theme.fg("toolTitle", `subagent ${args.op}`), 0, 0);
      },
      renderResult(result, options, theme, context) {
        const facadeArgs = context.args;
        const routed = renderParams(facadeArgs);
        const toolName = facadeArgs.op === "result"
          ? "get_subagent_result"
          : facadeArgs.op === "steer"
            ? "steer_subagent"
            : "Agent";
        const target = tools.get(toolName);
        if (target?.renderResult) {
          return target.renderResult(result, options, theme, { ...context, args: routed });
        }
        const text = result.content
          .filter((entry): entry is { type: "text"; text: string } => entry.type === "text")
          .map((entry) => entry.text)
          .join("\n");
        return new Text(text, 0, 0);
      },
      async execute(callId, params, signal, onUpdate, ctx) {
        if (params.op === "help") {
          const requested = params.input?.trim();
          const helpToolName = requested === "run"
            ? "Agent"
            : requested === "result"
              ? "get_subagent_result"
              : requested === "steer"
                ? "steer_subagent"
                : undefined;
          const helpTool = helpToolName ? tools.get(helpToolName) : undefined;
          const text = helpTool
            ? `${requested} -> ${helpToolName}\n\n${helpTool.description ?? ""}\n\nParameters:\n${JSON.stringify(helpTool.parameters, null, 2)}`
            : "Subagent operations: run, result, steer. Use op=help with input set to one operation for its complete parameters.";
          return { content: [{ type: "text", text }], details: {} };
        }
        const toolName = params.op === "result"
          ? "get_subagent_result"
          : params.op === "steer"
            ? "steer_subagent"
            : "Agent";
        const target = tools.get(toolName);
        if (!target) {
          return {
            content: [{ type: "text", text: `subagent operation is unavailable: ${params.op}` }],
            details: {},
          };
        }
        const { op: _op, input, ...common } = params;
        let advanced: Record<string, unknown> = {};
        if (input) {
          try {
            const parsed = JSON.parse(input) as unknown;
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
              throw new Error("expected a JSON object");
            }
            advanced = parsed as Record<string, unknown>;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`subagent input is invalid JSON: ${message}`);
          }
        }
        const routedParams = { ...advanced, ...common };
        const validationErrors = [...Value.Errors(target.parameters, routedParams)];
        if (validationErrors.length > 0) {
          const summary = validationErrors
            .map((error) => `${error.path || "/"}: ${error.message}`)
            .join("; ");
          throw new Error(`subagent ${params.op} parameters are invalid: ${summary}`);
        }
        return target.execute(callId, routedParams, signal, onUpdate, ctx);
      },
    };
    pi.registerTool(facadeTool);
  };
}

export default createSubagentsFacade();
