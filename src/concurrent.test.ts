import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { promisify } from "node:util";
import { resolve } from "node:path";

const execFileAsync = promisify(execFile);
const tempStatePath = resolve(".continuity/test-concurrent-state.json");
const tempLockPath = `${tempStatePath}.lock`;

test("concurrent multi-process test: 2 parallel Node child processes executing 25 mutations each (50 total) with zero lost updates", async () => {
  if (existsSync(tempStatePath)) rmSync(tempStatePath);
  if (existsSync(tempLockPath)) rmSync(tempLockPath);

  const env = { ...process.env, CONTINUITY_STATE_PATH: tempStatePath };

  // Initialize state file
  const { Store } = await import("./store.js");
  new Store("concurrent-test");

  const workerScript = (workerId: string, count: number) => `
    import("./dist/store.js").then(async ({ Store }) => {
      const store = new Store("concurrent-test");
      for (let i = 0; i < ${count}; i++) {
        store.logDecision("${workerId}", "${workerId}_decision_" + i, "payload from ${workerId} index " + i);
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 15) + 5));
      }
      console.log(JSON.stringify({ worker: "${workerId}", pid: process.pid, completed: ${count} }));
    });
  `;

  const scriptP1 = workerScript("P1", 25);
  const scriptP2 = workerScript("P2", 25);

  const [res1, res2] = await Promise.all([
    execFileAsync(process.execPath, ["--input-type=module", "-e", scriptP1], { env, encoding: "utf8" }),
    execFileAsync(process.execPath, ["--input-type=module", "-e", scriptP2], { env, encoding: "utf8" })
  ]);

  const out1 = JSON.parse(res1.stdout.trim());
  const out2 = JSON.parse(res2.stdout.trim());

  console.log(`[Worker P1] PID: ${out1.pid} completed ${out1.completed} mutations`);
  console.log(`[Worker P2] PID: ${out2.pid} completed ${out2.completed} mutations`);

  assert.notEqual(out1.pid, out2.pid, "Worker P1 and P2 must run in distinct OS processes with different PIDs");
  assert.equal(out1.completed, 25);
  assert.equal(out2.completed, 25);

  // Validate state file
  const { readFileSync } = await import("node:fs");
  const finalRaw = JSON.parse(readFileSync(tempStatePath, "utf8"));

  const p1Decisions = finalRaw.decisions.filter((d: any) => d.actor === "P1");
  const p2Decisions = finalRaw.decisions.filter((d: any) => d.actor === "P2");

  assert.equal(p1Decisions.length, 25, `Expected 25 decisions from P1, got ${p1Decisions.length}`);
  assert.equal(p2Decisions.length, 25, `Expected 25 decisions from P2, got ${p2Decisions.length}`);
  assert.equal(finalRaw.decisions.length, 50, `Expected total 50 decisions, got ${finalRaw.decisions.length}`);

  // Verify all sequential indexes for both workers exist
  for (let i = 0; i < 25; i++) {
    assert.ok(p1Decisions.some((d: any) => d.decision === `P1_decision_${i}`), `Missing P1_decision_${i}`);
    assert.ok(p2Decisions.some((d: any) => d.decision === `P2_decision_${i}`), `Missing P2_decision_${i}`);
  }

  if (existsSync(tempStatePath)) rmSync(tempStatePath);
  if (existsSync(tempLockPath)) rmSync(tempLockPath);
});
