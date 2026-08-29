import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import { Type } from "@sinclair/typebox";

const jiti = createJiti(import.meta.url, { moduleCache: false });
const extensionModule = await jiti.import(fileURLToPath(new URL("../index.ts", import.meta.url)));
const { createSubagentsFacade } = extensionModule;

function makeFakeUpstream(calls = []) {
  return (pi) => {
    for (const name of ["Agent", "get_subagent_result", "steer_subagent"]) {
      const marker = Type.Optional(Type.String({ description: `${name} marker` }));
      const parameters = name === "Agent"
        ? Type.Object({
            marker,
            prompt: Type.String(),
            description: Type.String(),
            subagent_type: Type.String(),
          })
        : name === "get_subagent_result"
          ? Type.Object({
              marker,
              agent_id: Type.String(),
              wait: Type.Optional(Type.Boolean()),
              verbose: Type.Optional(Type.Boolean()),
            })
          : Type.Object({
              marker,
              agent_id: Type.String(),
              message: Type.String(),
            });
      pi.registerTool({
        name,
        description: `${name} full description`,
        parameters,
        renderCall(args, theme, context) {
          return { kind: "call", name, args, theme, context };
        },
        renderResult(result, options, theme, context) {
          return { kind: "result", name, result, options, theme, context };
        },
        async execute(callId, params, signal, onUpdate, ctx) {
          calls.push({ name, callId, params, signal, onUpdate, ctx });
          return { content: [{ type: "text", text: name }], details: { name } };
        },
      });
    }
  };
}

function makePi() {
  const tools = [];
  const noOp = () => undefined;
  const pi = new Proxy({
    registerTool(tool) { tools.push(tool); },
    on: noOp,
    registerCommand: noOp,
    registerShortcut: noOp,
    registerMessageRenderer: noOp,
    events: { on: noOp, emit: noOp },
  }, {
    get(target, key) {
      if (key === "tools") return tools;
      return key in target ? target[key] : noOp;
    },
  });
  return pi;
}

test("registers one subagent facade instead of three provider tools", () => {
  assert.equal(typeof createSubagentsFacade, "function");
  const pi = makePi();
  createSubagentsFacade(makeFakeUpstream())(pi);

  assert.deepEqual(pi.tools.map((tool) => tool.name), ["subagent"]);
  assert.deepEqual(pi.tools[0].parameters.required, ["op"]);
  assert.deepEqual(pi.tools[0].parameters.properties.op.enum, ["run", "result", "steer", "help"]);
});

test("run forwards common fields and the complete execution context to Agent", async () => {
  const calls = [];
  const pi = makePi();
  createSubagentsFacade(makeFakeUpstream(calls))(pi);
  const facade = pi.tools[0];
  const signal = new AbortController().signal;
  const onUpdate = () => undefined;
  const ctx = { cwd: "C:/work" };

  const result = await facade.execute(
    "call-run",
    {
      op: "run",
      prompt: "Inspect the parser",
      description: "inspect parser",
      subagent_type: "Explore",
      run_in_background: true,
    },
    signal,
    onUpdate,
    ctx,
  );

  assert.deepEqual(calls, [{
    name: "Agent",
    callId: "call-run",
    params: {
      prompt: "Inspect the parser",
      description: "inspect parser",
      subagent_type: "Explore",
      run_in_background: true,
    },
    signal,
    onUpdate,
    ctx,
  }]);
  assert.equal(result.details.name, "Agent");
});

test("run merges advanced JSON while direct common fields take precedence", async () => {
  const calls = [];
  const pi = makePi();
  createSubagentsFacade(makeFakeUpstream(calls))(pi);

  await pi.tools[0].execute(
    "call-advanced",
    {
      op: "run",
      prompt: "Use the direct prompt",
      description: "advanced run",
      subagent_type: "general-purpose",
      input: JSON.stringify({
        prompt: "Ignore this prompt",
        model: "openai-codex/gpt-5.6-sol",
        thinking: "high",
        max_turns: 8,
        isolation: "worktree",
        schedule: "+5m",
      }),
    },
    undefined,
    undefined,
    { cwd: "C:/work" },
  );

  assert.deepEqual(calls[0].params, {
    prompt: "Use the direct prompt",
    model: "openai-codex/gpt-5.6-sol",
    thinking: "high",
    max_turns: 8,
    isolation: "worktree",
    schedule: "+5m",
    description: "advanced run",
    subagent_type: "general-purpose",
  });
});

test("result and steer route to their original tools", async () => {
  const calls = [];
  const pi = makePi();
  createSubagentsFacade(makeFakeUpstream(calls))(pi);
  const facade = pi.tools[0];

  await facade.execute(
    "call-result",
    { op: "result", agent_id: "agent-1", input: '{"wait":true,"verbose":true}' },
    undefined,
    undefined,
    { cwd: "C:/work" },
  );
  await facade.execute(
    "call-steer",
    { op: "steer", agent_id: "agent-1", message: "Focus on tests" },
    undefined,
    undefined,
    { cwd: "C:/work" },
  );

  assert.deepEqual(calls.map(({ name, params }) => ({ name, params })), [
    {
      name: "get_subagent_result",
      params: { wait: true, verbose: true, agent_id: "agent-1" },
    },
    {
      name: "steer_subagent",
      params: { agent_id: "agent-1", message: "Focus on tests" },
    },
  ]);
});

test("help discloses the original operation schema without executing it", async () => {
  const calls = [];
  const pi = makePi();
  createSubagentsFacade(makeFakeUpstream(calls))(pi);

  const result = await pi.tools[0].execute(
    "call-help",
    { op: "help", input: "run" },
    undefined,
    undefined,
    { cwd: "C:/work" },
  );
  const text = result.content[0].text;

  assert.equal(calls.length, 0);
  assert.match(text, /Agent full description/);
  assert.match(text, /"marker"/);
  assert.match(text, /Agent marker/);
});

test("rejects parameters that fail the hidden original schema", async () => {
  const calls = [];
  const pi = makePi();
  createSubagentsFacade(makeFakeUpstream(calls))(pi);

  await assert.rejects(
    pi.tools[0].execute(
      "call-invalid",
      { op: "run", prompt: "Missing required fields" },
      undefined,
      undefined,
      { cwd: "C:/work" },
    ),
    /subagent run parameters are invalid.*description/s,
  );
  assert.equal(calls.length, 0);
});

test("keeps provider-facing metadata within the facade budget", () => {
  const pi = makePi();
  createSubagentsFacade(makeFakeUpstream())(pi);
  const facade = pi.tools[0];
  const schema = JSON.stringify({
    name: facade.name,
    description: facade.description,
    parameters: facade.parameters,
  });
  const prompt = [facade.promptSnippet, ...(facade.promptGuidelines ?? [])]
    .filter(Boolean)
    .join("\n");

  assert.ok(schema.length + prompt.length <= 1_200, `${schema.length + prompt.length} chars`);
});

test("run delegates call and result rendering to the original Agent tool", () => {
  const pi = makePi();
  createSubagentsFacade(makeFakeUpstream())(pi);
  const facade = pi.tools[0];
  const args = {
    op: "run",
    prompt: "Inspect",
    description: "inspect code",
    subagent_type: "Explore",
  };
  const theme = { fg: () => "" };
  const context = { args, isPartial: false, isError: false };

  const callView = facade.renderCall(args, theme, context);
  const result = { content: [{ type: "text", text: "done" }], details: { status: "completed" } };
  const resultView = facade.renderResult(result, { expanded: false, isPartial: false }, theme, context);

  assert.equal(callView.name, "Agent");
  assert.deepEqual(callView.args, {
    prompt: "Inspect",
    description: "inspect code",
    subagent_type: "Explore",
  });
  assert.equal(resultView.name, "Agent");
  assert.deepEqual(resultView.context.args, callView.args);
});
