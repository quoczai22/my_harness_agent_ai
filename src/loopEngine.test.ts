import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git, hasUncommittedChanges } from "./gitWorktree.js";
import { detectRepoCommands, LoopEngine } from "./loopEngine.js";
import { DEFAULT_PIPELINE } from "./pipeline.js";
import { makeTempRepo } from "./testSupport.js";

/**
 * A stand-in for the agent CLIs. It reads its role from the prompt, writes
 * files like an implementer would, and answers verdicts from a scenario file.
 */
const FAKE_AGENT = `
const fs = require("fs");
const path = require("path");
const [scenarioPath, prompt] = process.argv.slice(2);
const dir = path.dirname(scenarioPath);
const scenario = JSON.parse(fs.readFileSync(scenarioPath, "utf8"));
const countersPath = path.join(dir, "counters.json");
const counters = fs.existsSync(countersPath) ? JSON.parse(fs.readFileSync(countersPath, "utf8")) : {};
const role = prompt.startsWith("You are the implementer") ? "implement"
  : prompt.startsWith("You are the tester") ? "test"
  : prompt.startsWith("You are the reviewer") ? "review" : "plan";
const n = (counters[role] = (counters[role] || 0) + 1);
fs.writeFileSync(countersPath, JSON.stringify(counters));
fs.mkdirSync(path.join(dir, "prompts"), { recursive: true });
fs.writeFileSync(path.join(dir, "prompts", role + "-" + n + ".txt"), prompt);
if (role === "implement") {
  fs.mkdirSync("src", { recursive: true });
  fs.writeFileSync("src/feature.js", "export const round = " + n + ";\\n");
  if (scenario.writeOutside) fs.writeFileSync("README.md", "overwritten\\n");
  console.log("Changed src/feature.js");
} else {
  const list = scenario[role + "Verdicts"] || ["PASS"];
  const verdict = list[Math.min(n - 1, list.length - 1)];
  if (verdict === "NONE") { console.log("I forgot the format"); process.exit(0); }
  if (verdict === "ECHO") { console.log("End your answer with exactly these lines:\\nVERDICT: PASS or VERDICT: FAIL\\nISSUES:\\nERROR: the CLI crashed"); process.exit(1); }
  if (verdict === "QUOTA") { console.log("ERROR: You've hit your usage limit. Try again at 2:21 PM."); process.exit(1); }
  console.log("Checked.\\nVERDICT: " + verdict + "\\nISSUES:\\n" + (verdict === "FAIL" ? "- login button does nothing" : ""));
}
`;

function setup(scenario: Record<string, unknown>, options: { testCommand?: string | null } = {}) {
  const { dir, repo } = makeTempRepo();
  const tools = join(dir, "tools");
  mkdirSync(tools, { recursive: true });
  const fake = join(tools, "fake-agent.cjs");
  writeFileSync(fake, FAKE_AGENT);
  const scenarioPath = join(tools, "scenario.json");
  writeFileSync(scenarioPath, JSON.stringify(scenario));
  const cmd = [process.execPath, fake, scenarioPath, "{prompt}"];
  const configPath = join(dir, "state", "agents.json");
  mkdirSync(join(dir, "state"), { recursive: true });
  writeFileSync(configPath, JSON.stringify({
    agents: { claude: { cmd, review_cmd: cmd }, codex: { cmd, review_cmd: cmd }, antigravity: { cmd } },
    timeouts: { workerMinutes: 1, reviewMinutes: 1, buildMinutes: 1 },
  }));
  const engine = new LoopEngine({ stateRoot: join(dir, "state"), agentConfigPath: configPath, agentKitConfigPath: join(dir, "none.json") });
  if (options.testCommand !== null) engine.setCommands("ws", { test: options.testCommand ?? "node -e \"process.exit(0)\"" });
  const counters = () => JSON.parse(readFileSync(join(tools, "counters.json"), "utf8"));
  const prompt = (name: string) => readFileSync(join(tools, "prompts", `${name}.txt`), "utf8");
  return { dir, repo, engine, counters, prompt, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("a task passes the default pipeline in one round and lands as a commit on the run branch", async () => {
  const t = setup({ testVerdicts: ["PASS"], reviewVerdicts: ["PASS"] });
  try {
    const [task] = t.engine.addTasks("ws", [{ title: "Add login page", allowedFiles: ["src/**"], acceptance: ["Login form renders"] }], "user");
    const run = t.engine.startRun("ws", t.repo);
    await t.engine.waitForIdle(run.id);

    const done = t.engine.getRun("ws", run.id);
    assert.equal(done.status, "completed", done.error);
    const state = t.engine.store("ws").read();
    assert.equal(state.tasks[0].status, "passed");
    assert.match(state.tasks[0].commit ?? "", /^[0-9a-f]{40}$/);
    assert.deepEqual(t.counters(), { implement: 1, test: 1, review: 1 });
    assert.match(t.prompt("test-1"), /Acceptance criteria[\s\S]*Login form renders/);
    assert.match(t.prompt("review-1"), /src\/feature\.js/);

    assert.equal(git(t.repo, ["show", `${done.branch}:src/feature.js`]).stdout, "export const round = 1;\n");
    assert.equal(existsSync(join(t.repo, "src", "feature.js")), false, "the imported repository is never written");
    assert.equal(hasUncommittedChanges(t.repo), false);
    assert.equal(existsSync(done.worktree), false, "a finished worktree is removed; the branch keeps the work");

    const types = t.engine.store("ws").readEvents(run.id).map((e) => e.type);
    assert.equal(types[0], "run-started");
    assert.ok(types.includes("commit"));
    assert.equal(types.at(-1), "run-finished");
    assert.equal(task.status, "queued");
  } finally {
    t.cleanup();
  }
});

test("a failed test sends the work back to Antigravity with the failure, then passes", async () => {
  const t = setup({ testVerdicts: ["FAIL", "PASS"], reviewVerdicts: ["PASS"] });
  try {
    t.engine.addTasks("ws", [{ title: "Fix login", allowedFiles: ["src/**"] }], "user");
    const run = t.engine.startRun("ws", t.repo);
    await t.engine.waitForIdle(run.id);
    assert.equal(t.engine.getRun("ws", run.id).status, "completed");
    assert.deepEqual(t.counters(), { implement: 2, test: 2, review: 1 });
    assert.match(t.prompt("implement-2"), /previous round failed \(1 of 3 rounds used\)[\s\S]*login button does nothing/);
    const rounds = t.engine.store("ws").readEvents(run.id).filter((e) => e.type === "round");
    assert.equal(rounds.length, 1);
    assert.equal(git(t.repo, ["show", `harness/${run.id}:src/feature.js`]).stdout, "export const round = 2;\n");
  } finally {
    t.cleanup();
  }
});

test("a task is blocked after 3 failed rounds and resuming gives it fresh rounds", async () => {
  const t = setup({ testVerdicts: ["FAIL", "FAIL", "FAIL", "PASS"], reviewVerdicts: ["PASS"] });
  try {
    t.engine.addTasks("ws", [{ title: "Hard task", allowedFiles: ["src/**"] }], "user");
    const run = t.engine.startRun("ws", t.repo);
    await t.engine.waitForIdle(run.id);
    let state = t.engine.store("ws").read();
    assert.equal(state.tasks[0].status, "blocked");
    assert.equal(state.tasks[0].failedRounds, 3);
    assert.equal(t.engine.getRun("ws", run.id).status, "blocked");
    assert.deepEqual(t.counters(), { implement: 3, test: 3 });
    assert.equal(existsSync(t.engine.getRun("ws", run.id).worktree), true, "a blocked run keeps its worktree");

    t.engine.resume("ws", run.id);
    await t.engine.waitForIdle(run.id);
    state = t.engine.store("ws").read();
    assert.equal(state.tasks[0].status, "passed");
    assert.equal(t.engine.getRun("ws", run.id).status, "completed");
  } finally {
    t.cleanup();
  }
});

test("files outside allowedFiles are reverted and cost a round", async () => {
  const t = setup({ writeOutside: true, testVerdicts: ["PASS"], reviewVerdicts: ["PASS"] });
  try {
    t.engine.addTasks("ws", [{ title: "Scoped", allowedFiles: ["src/**"] }], "user");
    const run = t.engine.startRun("ws", t.repo);
    await t.engine.waitForIdle(run.id);
    const events = t.engine.store("ws").readEvents(run.id);
    const failed = events.find((e) => e.type === "stage-finished" && e.data?.passed === false);
    assert.match(String(failed?.data?.issues), /outside the allowed list \(reverted\): README\.md/);
    assert.equal(t.engine.store("ws").read().tasks[0].status, "blocked");
  } finally {
    t.cleanup();
  }
});

test("a missing verdict is asked once more, and a missing test command blocks without spending rounds", async () => {
  const noVerdict = setup({ testVerdicts: ["NONE", "PASS"], reviewVerdicts: ["PASS"] });
  try {
    noVerdict.engine.addTasks("ws", [{ title: "Format" }], "user");
    const run = noVerdict.engine.startRun("ws", noVerdict.repo);
    await noVerdict.engine.waitForIdle(run.id);
    assert.equal(noVerdict.engine.getRun("ws", run.id).status, "completed");
    assert.equal(noVerdict.counters().test, 2);
  } finally {
    noVerdict.cleanup();
  }

  const noCommand = setup({}, { testCommand: null });
  try {
    noCommand.engine.addTasks("ws", [{ title: "No tests here" }], "user");
    const run = noCommand.engine.startRun("ws", noCommand.repo);
    await noCommand.engine.waitForIdle(run.id);
    const state = noCommand.engine.store("ws").read();
    assert.equal(state.tasks[0].status, "blocked");
    assert.equal(state.tasks[0].failedRounds, 0);
    assert.match(String(noCommand.engine.getRun("ws", run.id).error), /No test command is set/);
  } finally {
    noCommand.cleanup();
  }
});

test("an agent that echoes the instructions and exits with an error never passes", async () => {
  const t = setup({ testVerdicts: ["ECHO", "ECHO", "PASS"], reviewVerdicts: ["PASS"] });
  try {
    t.engine.addTasks("ws", [{ title: "Echo" }], "user");
    const run = t.engine.startRun("ws", t.repo);
    await t.engine.waitForIdle(run.id);
    const events = t.engine.store("ws").readEvents(run.id);
    const firstGate = events.find((e) => e.type === "stage-finished" && e.stageId === "test");
    assert.equal(firstGate?.data?.passed, false);
    assert.equal(firstGate?.data?.verdict, null);
    assert.match(String(firstGate?.data?.issues), /exited with an error/);
    assert.equal(t.engine.getRun("ws", run.id).status, "completed");
    assert.deepEqual(t.counters(), { implement: 2, test: 3, review: 1 });
  } finally {
    t.cleanup();
  }
});

test("an agent out of quota blocks the task at once instead of spending rounds", async () => {
  const t = setup({ testVerdicts: ["QUOTA"] });
  try {
    t.engine.addTasks("ws", [{ title: "Quota" }], "user");
    const run = t.engine.startRun("ws", t.repo);
    await t.engine.waitForIdle(run.id);
    const task = t.engine.store("ws").read().tasks[0];
    assert.equal(task.status, "blocked");
    assert.equal(task.failedRounds, 0);
    assert.deepEqual(t.counters(), { implement: 1, test: 1 });
    assert.match(String(t.engine.getRun("ws", run.id).error), /out of quota or rate-limited: ERROR: You've hit your usage limit/);
  } finally {
    t.cleanup();
  }
});

test("a failing test command fails the gate even when the agent says PASS", async () => {
  const t = setup({ testVerdicts: ["PASS"], reviewVerdicts: ["PASS"] }, { testCommand: "echo broken build; exit 2" });
  try {
    t.engine.addTasks("ws", [{ title: "Gate" }], "user");
    const run = t.engine.startRun("ws", t.repo);
    await t.engine.waitForIdle(run.id);
    assert.equal(t.engine.store("ws").read().tasks[0].status, "blocked");
    assert.match(t.prompt("implement-2"), /Test command failed \(exit code 2\)[\s\S]*broken build/);
  } finally {
    t.cleanup();
  }
});

test("human checkpoints wait for an answer, and cancel stops the run", async () => {
  const t = setup({});
  try {
    t.engine.setPipeline("ws", {
      id: "human-end", name: "Implement then approve", maxRounds: 2,
      stages: [{ id: "build", kind: "agent", agent: "codex", role: "implement" }, { id: "approve", kind: "human" }],
    });
    t.engine.addTasks("ws", [{ title: "Needs a look" }, { title: "Second" }], "user");
    const run = t.engine.startRun("ws", t.repo);
    const waitFor = async (status: string) => {
      for (let i = 0; i < 400 && t.engine.getRun("ws", run.id).status !== status; i++) await new Promise((r) => setTimeout(r, 25));
      assert.equal(t.engine.getRun("ws", run.id).status, status);
    };
    await waitFor("waiting-human");
    t.engine.answerHuman("ws", run.id, true);
    for (let i = 0; i < 400 && t.engine.store("ws").read().tasks[0].status !== "passed"; i++) await new Promise((r) => setTimeout(r, 25));
    assert.equal(t.engine.store("ws").read().tasks[0].status, "passed");
    await waitFor("waiting-human");
    t.engine.cancel("ws", run.id);
    await t.engine.waitForIdle(run.id);
    assert.equal(t.engine.getRun("ws", run.id).status, "canceled");
    assert.equal(t.engine.store("ws").read().tasks[1].status, "queued");
  } finally {
    t.cleanup();
  }
});

test("runs left mid-flight are marked interrupted when the state is loaded again", async () => {
  const t = setup({});
  try {
    const store = t.engine.store("ws");
    store.update((state) => {
      state.runs.push({ ...JSON.parse(JSON.stringify({ id: "run-x", workspaceId: "ws", repoRoot: t.repo, pipeline: DEFAULT_PIPELINE, branch: "harness/run-x", worktree: join(t.dir, "nowhere"), base: "", status: "running", stageResults: {}, doneTaskIds: [], createdAt: "", updatedAt: "" })) });
    });
    const fresh = new LoopEngine({ stateRoot: join(t.dir, "state"), agentConfigPath: join(t.dir, "state", "agents.json") });
    assert.equal(fresh.getRun("ws", "run-x").status, "interrupted");
    assert.throws(() => fresh.resume("ws", "run-x"), /WORKTREE_MISSING/);
  } finally {
    t.cleanup();
  }
});

test("repository commands come from INDEX.md, then package.json", () => {
  const { dir, repo } = makeTempRepo();
  try {
    assert.deepEqual(detectRepoCommands(repo), {});
    writeFileSync(join(repo, "package.json"), JSON.stringify({ scripts: { test: "node --test", build: "tsc" } }));
    assert.deepEqual(detectRepoCommands(repo), { test: "npm test", build: "npm run build" });
    writeFileSync(join(repo, "INDEX.md"), "## Lệnh\n- Build: none\n- Test: `make check`\n");
    assert.deepEqual(detectRepoCommands(repo), { test: "make check", build: "npm run build" });
    assert.ok(readdirSync(dir).length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
