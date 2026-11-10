import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandFor, DEFAULT_AGENT_CONFIG, loadAgentConfig, MAX_PROMPT_BYTES, parseVerdict, runProcess } from "./agentRunner.js";

test("parseVerdict reads the last verdict and the issues", () => {
  assert.deepEqual(parseVerdict("work...\nVERDICT: FAIL\nISSUES:\n- button missing"), { verdict: "FAIL", issues: "- button missing" });
  assert.equal(parseVerdict("**VERDICT:** pass\nVERDICT: PASS").verdict, "PASS");
  assert.equal(parseVerdict("VERDICT: FAIL first\nlater\nVERDICT: PASS").verdict, "PASS");
  assert.deepEqual(parseVerdict("no verdict here"), { verdict: null, issues: "" });
});

test("commandFor uses review_cmd for reading roles and substitutes the prompt", () => {
  assert.deepEqual(commandFor(DEFAULT_AGENT_CONFIG, "codex", "test", "hi"), ["codex", "exec", "--sandbox", "read-only", "hi"]);
  assert.deepEqual(commandFor(DEFAULT_AGENT_CONFIG, "codex", "implement", "hi"), ["codex", "exec", "--sandbox", "workspace-write", "hi"]);
  assert.deepEqual(commandFor(DEFAULT_AGENT_CONFIG, "antigravity", "review", "hi"), ["agy", "--print", "hi"]);
  assert.throws(() => commandFor(DEFAULT_AGENT_CONFIG, "codex", "implement", "x".repeat(MAX_PROMPT_BYTES + 1)), /PROMPT_TOO_LARGE/);
  assert.throws(() => commandFor({ ...DEFAULT_AGENT_CONFIG, agents: {} }, "codex", "implement", "hi"), /AGENT_NOT_CONFIGURED/);
});

test("loadAgentConfig starts from the agent-run config and keeps defaults for missing parts", () => {
  const dir = mkdtempSync(join(tmpdir(), "harness-config-"));
  try {
    const kit = join(dir, "kit.json");
    writeFileSync(kit, JSON.stringify({ agents: { codex: { cmd: ["codex", "exec", "-m", "x", "{prompt}"] } }, timeouts: { workerMinutes: 5 } }));
    const target = join(dir, "state", "agents.json");
    const config = loadAgentConfig(target, kit);
    assert.equal(existsSync(target), true);
    assert.deepEqual(config.agents.codex?.cmd, ["codex", "exec", "-m", "x", "{prompt}"]);
    assert.equal(config.timeouts.workerMinutes, 5);
    assert.equal(config.timeouts.reviewMinutes, 20);
    assert.ok(config.agents.antigravity);

    const fresh = join(dir, "fresh", "agents.json");
    loadAgentConfig(fresh, join(dir, "missing.json"));
    assert.deepEqual(JSON.parse(readFileSync(fresh, "utf8")).agents.antigravity.cmd, ["agy", "--print", "{prompt}"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runProcess reports exit code, output, timeout, cancellation and missing commands", async () => {
  const ok = await runProcess([process.execPath, "-e", "console.log('hello'); console.error('warn'); process.exit(3)"], { cwd: tmpdir(), timeoutMs: 10_000 });
  assert.equal(ok.exitCode, 3);
  assert.match(ok.output, /hello/);
  assert.match(ok.output, /warn/);

  const slow = await runProcess([process.execPath, "-e", "setTimeout(() => {}, 60000)"], { cwd: tmpdir(), timeoutMs: 300 });
  assert.equal(slow.timedOut, true);

  const controller = new AbortController();
  const pending = runProcess([process.execPath, "-e", "setTimeout(() => {}, 60000)"], { cwd: tmpdir(), timeoutMs: 10_000, signal: controller.signal });
  setTimeout(() => controller.abort(), 200);
  assert.equal((await pending).canceled, true);

  const missing = await runProcess(["definitely-not-a-command-xyz"], { cwd: tmpdir(), timeoutMs: 5_000 });
  assert.match(missing.error ?? "", /Command not found/);
});
