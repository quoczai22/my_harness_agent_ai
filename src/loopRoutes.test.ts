import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { createDashboardServer } from "./dashboard.js";
import { git } from "./gitWorktree.js";
import { makeTempRepo } from "./testSupport.js";

const FAKE_AGENT = `
const fs = require("fs");
const prompt = process.argv[2];
if (process.argv.includes("stream-json")) {
  console.log(JSON.stringify({ type: "system", subtype: "init", session_id: "11111111-2222-3333-4444-555555555555" }));
  const reply = prompt.startsWith("Split what we discussed")
    ? 'Two tasks.\\n\`\`\`json\\n{"tasks":[{"title":"Login form","allowedFiles":["src/**"],"acceptance":["renders"]}]}\\n\`\`\`'
    : "Hello from fake Claude";
  console.log(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: reply }] } }));
  console.log(JSON.stringify({ type: "result", subtype: "success", result: reply, session_id: "11111111-2222-3333-4444-555555555555", is_error: false }));
} else if (prompt.startsWith("You are the implementer")) {
  fs.mkdirSync("src", { recursive: true });
  fs.writeFileSync("src/login.js", "export {};\\n");
} else {
  console.log("VERDICT: PASS\\nISSUES:");
}
`;

function call(port: number, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; text: string }> {
  return new Promise((resolvePromise, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = request({
      host: "127.0.0.1", port, method, path,
      headers: { ...(data ? { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` } : {}), ...headers },
    }, (res) => {
      let text = "";
      res.on("data", (chunk) => (text += chunk));
      res.on("end", () => resolvePromise({ status: res.statusCode ?? 0, text }));
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

test("the loop API runs a task end to end, streams events, chats with Claude and proposes tasks", async () => {
  const { dir, repo } = makeTempRepo();
  writeFileSync(join(repo, "package.json"), JSON.stringify({ scripts: { test: "node -e \"process.exit(0)\"" } }));
  git(repo, ["-c", "user.name=T", "-c", "user.email=t@l", "add", "-A"]);
  git(repo, ["-c", "user.name=T", "-c", "user.email=t@l", "commit", "-q", "-m", "pkg"]);
  const fake = join(dir, "fake.cjs");
  writeFileSync(fake, FAKE_AGENT);
  const cmd = [process.execPath, fake, "{prompt}"];
  const configPath = join(dir, "agents.json");
  writeFileSync(configPath, JSON.stringify({ agents: { claude: { cmd, review_cmd: cmd }, codex: { cmd, review_cmd: cmd }, antigravity: { cmd } } }));
  const harnessRoot = join(dir, "harness");
  mkdirSync(join(harnessRoot, ".continuity"), { recursive: true });
  writeFileSync(join(harnessRoot, ".continuity", "workspaces.json"), JSON.stringify({ workspaces: [{ id: "demo", name: "Demo", path: repo }] }));
  const previous = process.env.HARNESS_AGENT_CONFIG;
  const previousState = process.env.HARNESS_STATE_DIR;
  process.env.HARNESS_AGENT_CONFIG = configPath;
  process.env.HARNESS_STATE_DIR = join(dir, "state");
  const dashboard = createDashboardServer({ workspaceRoot: harnessRoot, port: 0 });
  const port = await dashboard.start();
  try {
    // Cross-site requests are refused.
    assert.equal((await call(port, "POST", "/api/loop/runs?workspace=demo", {}, { Origin: "http://evil.example" })).status, 403);
    const noOrigin = await new Promise<number>((r) => {
      const req = request({ host: "127.0.0.1", port, method: "POST", path: "/api/loop/runs?workspace=demo", headers: { "Content-Type": "application/json" } }, (res) => { res.resume(); r(res.statusCode ?? 0); });
      req.end("{}");
    });
    assert.equal(noOrigin, 403);
    const plain = await new Promise<number>((r) => {
      const req = request({ host: "127.0.0.1", port, method: "POST", path: "/api/loop/runs?workspace=demo", headers: { "Content-Type": "text/plain", Origin: `http://127.0.0.1:${port}` } }, (res) => { res.resume(); r(res.statusCode ?? 0); });
      req.end("{}");
    });
    assert.equal(plain, 403);
    assert.equal((await call(port, "GET", "/api/loop/state?workspace=demo", undefined, { Host: "attacker.example" })).status, 403);

    const state0 = JSON.parse((await call(port, "GET", "/api/loop/state?workspace=demo")).text);
    assert.equal(state0.pipeline.id, "ui-test-review");
    assert.equal(state0.commands.test, "npm test");
    assert.equal((await call(port, "POST", "/api/loop/runs?workspace=demo", {})).status, 409);

    // Chat, then ask Claude to split the work into tasks.
    const session = JSON.parse((await call(port, "POST", "/api/sessions?workspace=demo", { title: "Login" })).text).session;
    const chat = await call(port, "POST", "/api/loop/chat?workspace=demo", { sessionId: session.id, message: "Hi" });
    assert.match(chat.text, /Hello from fake Claude/);
    const proposed = await call(port, "POST", "/api/loop/chat?workspace=demo", { sessionId: session.id, propose: true });
    assert.match(proposed.text, /"proposals":1/);
    const sessions = JSON.parse((await call(port, "GET", "/api/sessions?workspace=demo")).text).sessions;
    assert.equal(sessions[0].claudeSessionId, "11111111-2222-3333-4444-555555555555");
    assert.equal(sessions[0].messages.length, 4);

    let state = JSON.parse((await call(port, "GET", "/api/loop/state?workspace=demo")).text);
    assert.equal(state.tasks[0].status, "proposal");
    await call(port, "POST", "/api/loop/tasks/status?workspace=demo", { ids: [state.tasks[0].id], status: "queued" });

    const started = await call(port, "POST", "/api/loop/runs?workspace=demo", {});
    assert.equal(started.status, 201);
    const runId = JSON.parse(started.text).run.id;
    for (let i = 0; i < 400; i++) {
      state = JSON.parse((await call(port, "GET", "/api/loop/state?workspace=demo")).text);
      if (!state.activeRunId) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.equal(state.runs[0].status, "completed");
    assert.equal(state.tasks[0].status, "passed");
    const loopDirs = readdirSync(join(dir, "state", "loop"));
    assert.equal(loopDirs.length, 1);
    assert.match(loopDirs[0], /^demo-[0-9a-f]{10}$/, "loop state is keyed by workspace id and repository path");
    assert.ok(existsSync(join(dir, "state", "loop", loopDirs[0], "state.json")), "loop state lives in HARNESS_STATE_DIR");
    assert.ok(!existsSync(join(harnessRoot, ".continuity", "harness", "loop")), "nothing is written under the Harness root");

    const events = await new Promise<string>((resolvePromise) => {
      const req = request({ host: "127.0.0.1", port, path: `/api/loop/events?workspace=demo&run=${runId}` }, (res) => {
        let text = "";
        res.on("data", (chunk) => { text += chunk; if (text.includes('"run-finished"')) { req.destroy(); resolvePromise(text); } });
      });
      req.end();
    });
    assert.match(events, /^id: 1\ndata: \{.*"run-started"/);
    assert.match(events, /"commit"/);

    const agents = JSON.parse((await call(port, "GET", "/api/loop/agents")).text).agents;
    assert.deepEqual(agents.map((a: any) => a.id).slice(0, 1), ["claude"]);
    assert.ok(agents.some((a: any) => a.id === "lmstudio"));

    const badPipeline = await call(port, "POST", "/api/loop/pipeline?workspace=demo", { pipeline: { id: "x", name: "x", maxRounds: 3, stages: [] } });
    assert.equal(badPipeline.status, 400);
    assert.match(badPipeline.text, /at least one stage/);
  } finally {
    await dashboard.stop();
    if (previousState === undefined) delete process.env.HARNESS_STATE_DIR;
    else process.env.HARNESS_STATE_DIR = previousState;
    if (previous === undefined) delete process.env.HARNESS_AGENT_CONFIG;
    else process.env.HARNESS_AGENT_CONFIG = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});
