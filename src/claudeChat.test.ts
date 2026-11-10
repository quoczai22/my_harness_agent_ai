import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_AGENT_CONFIG } from "./agentRunner.js";
import { chatCommand, extractTaskProposals, parseStreamLine } from "./claudeChat.js";
import { cloneTargetName } from "./repoImport.js";

test("chatCommand keeps the main chat read-only and resumes the session", () => {
  const config = { ...DEFAULT_AGENT_CONFIG, agents: { claude: { cmd: ["claude", "-p", "{prompt}"], review_cmd: ["claude", "-p", "{prompt}", "--model", "sonnet", "--permission-mode", "acceptEdits"] } } };
  const argv = chatCommand(config, "hello", "0f0f9a20-b66b-4d75-a230-5428b95d950b");
  assert.deepEqual(argv.slice(0, 5), ["claude", "-p", "hello", "--model", "sonnet"]);
  assert.equal(argv.filter((part) => part === "--permission-mode").length, 1);
  assert.equal(argv[argv.indexOf("--permission-mode") + 1], "plan");
  assert.ok(argv.includes("stream-json") && argv.includes("--verbose"));
  assert.equal(argv[argv.indexOf("--resume") + 1], "0f0f9a20-b66b-4d75-a230-5428b95d950b");
  assert.throws(() => chatCommand(config, "x", "bad id; rm -rf"), /INVALID_CLAUDE_SESSION/);
});

test("parseStreamLine reads session, text, tools and result", () => {
  assert.deepEqual(parseStreamLine('{"type":"system","subtype":"init","session_id":"abc"}'), [{ type: "session", sessionId: "abc" }]);
  assert.deepEqual(parseStreamLine('{"type":"assistant","message":{"content":[{"type":"text","text":"Hi"},{"type":"tool_use","name":"Read"}]}}'), [{ type: "text", text: "Hi" }, { type: "tool", name: "Read" }]);
  assert.deepEqual(parseStreamLine('{"type":"result","subtype":"success","result":"Done","session_id":"abc","is_error":false,"total_cost_usd":0.01}'), [{ type: "result", text: "Done", sessionId: "abc", isError: false, costUsd: 0.01 }]);
  assert.deepEqual(parseStreamLine("not json"), []);
});

test("extractTaskProposals reads the last json block with tasks", () => {
  const text = 'Here:\n```json\n{"tasks":[{"title":"Old"}]}\n```\nRevised:\n```json\n{"tasks":[{"title":"Login UI","allowedFiles":["src/ui/**"],"acceptance":["form shows"]},{"description":"no title"}]}\n```';
  assert.deepEqual(extractTaskProposals(text), [{ title: "Login UI", description: "", allowedFiles: ["src/ui/**"], acceptance: ["form shows"] }]);
  assert.deepEqual(extractTaskProposals("no tasks here"), []);
});

test("clone URLs must be https without credentials", () => {
  assert.equal(cloneTargetName("https://github.com/quoczai22/my_harness_agent_ai.git"), "my_harness_agent_ai");
  assert.throws(() => cloneTargetName("git@github.com:a/b.git"), /INVALID_CLONE_URL/);
  assert.throws(() => cloneTargetName("http://example.com/a.git"), /MUST_BE_HTTPS/);
  assert.throws(() => cloneTargetName("https://user:token@github.com/a/b.git"), /HAS_CREDENTIALS/);
  assert.throws(() => cloneTargetName("https://github.com/"), /INVALID_CLONE_URL/);
});
