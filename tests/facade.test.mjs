import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const jiti = createJiti(import.meta.url, { moduleCache: false });
const extensionModule = await jiti.import(fileURLToPath(new URL("../index.ts", import.meta.url)));
const { createSubagentsFacade } = extensionModule;

function makeFakeUpstream(calls = []) {
  return (pi) => {
    for (const name of ["Agent", "get_subagent_result", "steer_subagent", "SubagentWorkflow"]) {
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
          : name === "SubagentWorkflow"
            ? Type.Object({
                marker,
                script: Type.Optional(Type.String()),
                scriptPath: Type.Optional(Type.String()),
                name: Type.Optional(Type.String()),
                args: Type.Optional(Type.Any()),
                resumeFromRunId: Type.Optional(Type.String()),
                title: Type.Optional(Type.String()),
                description: Type.Optional(Type.String()),
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

test("registers one subagent facade over the upstream tools", () => {
  assert.equal(typeof createSubagentsFacade, "function");
  const pi = makePi();
  createSubagentsFacade(makeFakeUpstream())(pi);

  assert.deepEqual(pi.tools.map((tool) => tool.name), ["subagent"]);
  assert.deepEqual(pi.tools[0].parameters.required, ["op"]);
  assert.deepEqual(pi.tools[0].parameters.properties.op.enum, ["run", "result", "steer", "workflow", "help"]);
});

test("uses enabled names from real pinned upstream initialization", () => {
  const root = mkdtempSync(join(tmpdir(), "subagents-lean-types-"));
  const cwd = process.cwd();
  const previousDir = process.env.PI_CODING_AGENT_DIR;
  const globalDir = join(root, "global");
  const projectDir = join(root, "project");
  mkdirSync(join(globalDir, "agents"), { recursive: true });
  writeFileSync(join(globalDir, "agent-tool-description.md"), "Custom tool help.");
  mkdirSync(join(projectDir, ".pi", "agents"), { recursive: true });
  const enabled = ["General", "Oracle", "Researcher", "Reviewer, Senior"];
  for (const [index, name] of [...enabled, "Writer"].entries()) {
    writeFileSync(join(globalDir, "agents", `${index}.md`),
      `---\nname: "${name}"\nenabled: ${name !== "Writer"}\n---\nTest agent.\n`);
  }
  try {
    process.env.PI_CODING_AGENT_DIR = globalDir;
    process.chdir(projectDir);
    for (const toolDescriptionMode of ["full", "compact", "custom"]) {
      writeFileSync(join(globalDir, "subagents.json"), JSON.stringify({
        disableDefaultAgents: true, toolDescriptionMode,
      }));
      const pi = makePi();
      createSubagentsFacade()(pi);
      assert.deepEqual(pi.tools.map((tool) => tool.name), ["subagent"]);
      assert.equal(pi.tools[0].parameters.properties.subagent_type.description,
        `Agent types at startup: ${enabled.join(", ")}.`);
      assert.deepEqual(pi.tools[0].parameters.required, ["op"]);
    }
    for (const [index, name] of enabled.entries()) {
      writeFileSync(join(projectDir, ".pi", "agents", `${index}.md`),
        `---\nname: "${name}"\nenabled: false\n---\nDisabled override.\n`);
    }
    const emptyPi = makePi();
    createSubagentsFacade()(emptyPi);
    assert.equal(emptyPi.tools[0].parameters.properties.subagent_type.description,
      "Agent types at startup: (none).");
  } finally {
    process.chdir(cwd);
    if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousDir;
    rmSync(root, { recursive: true, force: true });
  }
});

test("falls back on missing or changed upstream format without sharing schemas", () => {
  const fallback = 'Agent type; op=help with input "run" lists available types.';
  const schemas = [];
  for (const description of [
    "The type of specialized agent to use. Available types: General. Custom agents from test are also available.",
    undefined,
    "Updated upstream format: Oracle",
  ]) {
    const pi = makePi();
    createSubagentsFacade((capture) => makeFakeUpstream()({
      registerTool(tool) {
        if (tool.name === "Agent") tool.parameters.properties.subagent_type.description = description;
        capture.registerTool(tool);
      },
    }))(pi);
    schemas.push(pi.tools[0].parameters);
  }
  assert.equal(schemas[0].properties.subagent_type.description, "Agent types at startup: General.");
  assert.equal(schemas[1].properties.subagent_type.description, fallback);
  assert.equal(schemas[2].properties.subagent_type.description, fallback);
  assert.notEqual(schemas[0], schemas[1]);
  assert.notEqual(schemas[0].properties.subagent_type, schemas[1].properties.subagent_type);
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

test("prepareArguments infers an omitted op only from unambiguous fields", async () => {
  const calls = [];
  const pi = makePi();
  createSubagentsFacade(makeFakeUpstream(calls))(pi);
  const facade = pi.tools[0];
  const cases = [
    [{ prompt: "Inspect", description: "inspect parser", subagent_type: "Explore" }, "run", "Agent"],
    [{ agent_id: "agent-1" }, "result", "get_subagent_result"],
    [{ agent_id: "agent-1", message: "Stop" }, "steer", "steer_subagent"],
  ];

  for (const [raw, op, toolName] of cases) {
    const prepared = facade.prepareArguments(raw);
    assert.equal(prepared.op, op);
    assert.ok(Value.Check(facade.parameters, prepared));
    await facade.execute(`call-${op}`, prepared, undefined, undefined, { cwd: "C:/work" });
    assert.equal(calls.at(-1).name, toolName);
    assert.deepEqual(calls.at(-1).params, raw);
  }

  const explicit = { op: "help", prompt: "Inspect" };
  assert.equal(facade.prepareArguments(explicit), explicit);
  for (const ambiguous of [{}, { message: "Stop" }, { input: "{}" }, { prompt: "Inspect", agent_id: "agent-1" }, { subagent_type: "Explore", agent_id: "agent-1", message: "Go" }]) {
    assert.equal(facade.prepareArguments(ambiguous), ambiguous);
    assert.equal(Value.Check(facade.parameters, ambiguous), false);
  }
});

test("prepareArguments stringifies an object input and keeps it routable", async () => {
  const calls = [];
  const pi = makePi();
  createSubagentsFacade(makeFakeUpstream(calls))(pi);
  const facade = pi.tools[0];
  const raw = { op: "result", agent_id: "agent-1", input: { wait: true, verbose: true } };
  const rawSnapshot = structuredClone(raw);

  assert.equal(Value.Check(facade.parameters, raw), false);
  const prepared = facade.prepareArguments(raw);
  assert.deepEqual(raw, rawSnapshot);
  assert.deepEqual(prepared, { ...rawSnapshot, input: '{"wait":true,"verbose":true}' });
  assert.ok(Value.Check(facade.parameters, prepared));
  assert.deepEqual(facade.prepareArguments(prepared), prepared);

  await facade.execute("call-object-input", prepared, undefined, undefined, { cwd: "C:/work" });
  assert.deepEqual(calls.at(-1).params, { wait: true, verbose: true, agent_id: "agent-1" });

  // op inference still works once input has been stringified.
  const inferred = facade.prepareArguments({ agent_id: "agent-1", input: { wait: true } });
  assert.equal(inferred.op, "result");
  assert.equal(inferred.input, '{"wait":true}');

  // Rendering uses the same repaired arguments.
  const theme = { fg: () => "" };
  const view = facade.renderCall(raw, theme, { args: raw });
  assert.equal(view.name, "get_subagent_result");
  assert.deepEqual(view.args, { wait: true, verbose: true, agent_id: "agent-1" });
  const resultView = facade.renderResult({ content: [], details: {} }, {}, theme, { args: raw });
  assert.equal(resultView.name, "get_subagent_result");
  assert.deepEqual(resultView.context.args, view.args);

  // Non-object input is left for the original validation.
  for (const input of ["{}", 1, null]) {
    const same = { op: "result", agent_id: "agent-1", input };
    assert.equal(facade.prepareArguments(same), same);
  }
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

test("workflow routes JSON input to the upstream workflow tool", async () => {
  const calls = [];
  const pi = makePi();
  createSubagentsFacade(makeFakeUpstream(calls))(pi);
  const script = "export const meta = { name: 'batch', description: 'Run batch' };";

  await pi.tools[0].execute(
    "call-workflow",
    { op: "workflow", input: JSON.stringify({ script, args: { batch: 2 } }) },
    undefined,
    undefined,
    { cwd: "C:/work" },
  );

  assert.deepEqual(calls[0].name, "SubagentWorkflow");
  assert.deepEqual(calls[0].params, { script, args: { batch: 2 } });
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

test("makes both explicit waits discoverable without requiring help", () => {
  const pi = makePi();
  createSubagentsFacade(makeFakeUpstream())(pi);
  const facade = pi.tools[0];

  assert.match(facade.parameters.properties.run_in_background.description, /false.*waits/i);
  assert.ok(facade.promptGuidelines.some((line) => line.includes(`op=result with input '{"wait":true}'`)));
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

test("validates and routes against the real pinned upstream schemas", async () => {
  const root = mkdtempSync(join(tmpdir(), "subagents-lean-real-"));
  const previousDir = process.env.PI_CODING_AGENT_DIR;
  const calls = [];
  const { default: realUpstream } = await jiti.import("@tintinweb/pi-subagents/src/index.ts");
  const stubExecute = (pi) => realUpstream(new Proxy(pi, {
    get(target, key) {
      if (key !== "registerTool") return target[key];
      return (tool) => target.registerTool({
        ...tool,
        async execute(_callId, params) {
          calls.push({ name: tool.name, params });
          return { content: [{ type: "text", text: tool.name }], details: {} };
        },
      });
    },
  }));
  try {
    process.env.PI_CODING_AGENT_DIR = root;
    const pi = makePi();
    createSubagentsFacade(stubExecute)(pi);
    const facade = pi.tools[0];
    const run = (op, params) => facade.execute(op, { op, ...params }, undefined, undefined, { cwd: root });
    await run("run", { prompt: "p", description: "d", subagent_type: "General" });
    await run("result", { agent_id: "a", input: JSON.stringify({ wait: true }) });
    await run("steer", { agent_id: "a", message: "m" });
    await run("workflow", { input: JSON.stringify({ script: "return 1" }) });
    assert.deepEqual(calls.map((call) => call.name),
      ["Agent", "get_subagent_result", "steer_subagent", "SubagentWorkflow"]);
    assert.equal(calls[1].params.wait, true);
    await assert.rejects(run("run", { prompt: "p" }), /subagent run parameters are invalid.*description/s);
    assert.equal(calls.length, 4);
  } finally {
    if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousDir;
    rmSync(root, { recursive: true, force: true });
  }
});
