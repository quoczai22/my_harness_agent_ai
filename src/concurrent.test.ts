import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { promisify } from "node:util";
import { basename, dirname, resolve } from "node:path";

const execFileAsync = promisify(execFile);

function removeIfPresent(path: string): void {
  if (existsSync(path)) rmSync(path, { force: true });
}

function cleanTestArtifacts(tempStatePath: string): string[] {
  removeIfPresent(tempStatePath);
  removeIfPresent(`${tempStatePath}.lock`);

  const directory = dirname(tempStatePath);
  const atomicSavePrefix = `${basename(tempStatePath)}.`;
  const leftovers = readdirSync(directory)
    .filter(entry => entry.startsWith(atomicSavePrefix) && entry.endsWith(".tmp"));
  for (const leftover of leftovers) removeIfPresent(resolve(directory, leftover));

  return readdirSync(directory)
    .filter(entry => entry === basename(tempStatePath) || entry === `${basename(tempStatePath)}.lock` || (entry.startsWith(atomicSavePrefix) && entry.endsWith(".tmp")));
}

test("concurrent multi-process test: 2 parallel Node child processes executing 25 mutations each (50 total) with zero lost updates", async () => {
  const testId = `test-concurrent-state-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tempStatePath = resolve(".continuity", `${testId}.json`);
  const env = { ...process.env, CONTINUITY_STATE_PATH: tempStatePath };

  try {
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

    const [res1, res2] = await Promise.all([
      execFileAsync(process.execPath, ["--input-type=module", "-e", workerScript("P1", 25)], { env, encoding: "utf8" }),
      execFileAsync(process.execPath, ["--input-type=module", "-e", workerScript("P2", 25)], { env, encoding: "utf8" })
    ]);
    const out1 = JSON.parse(res1.stdout.trim());
    const out2 = JSON.parse(res2.stdout.trim());
    console.log(`[Worker P1] PID: ${out1.pid} completed ${out1.completed} mutations`);
    console.log(`[Worker P2] PID: ${out2.pid} completed ${out2.completed} mutations`);

    assert.notEqual(out1.pid, out2.pid, "Worker P1 and P2 must run in distinct OS processes with different PIDs");
    assert.equal(out1.completed, 25);
    assert.equal(out2.completed, 25);

    const { readFileSync } = await import("node:fs");
    const finalRaw = JSON.parse(readFileSync(tempStatePath, "utf8"));
    const p1Decisions = finalRaw.decisions.filter((d: any) => d.actor === "P1");
    const p2Decisions = finalRaw.decisions.filter((d: any) => d.actor === "P2");
    assert.equal(p1Decisions.length, 25, `Expected 25 decisions from P1, got ${p1Decisions.length}`);
    assert.equal(p2Decisions.length, 25, `Expected 25 decisions from P2, got ${p2Decisions.length}`);
    assert.equal(finalRaw.decisions.length, 50, `Expected total 50 decisions, got ${finalRaw.decisions.length}`);
    for (let i = 0; i < 25; i++) {
      assert.ok(p1Decisions.some((d: any) => d.decision === `P1_decision_${i}`), `Missing P1_decision_${i}`);
      assert.ok(p2Decisions.some((d: any) => d.decision === `P2_decision_${i}`), `Missing P2_decision_${i}`);
    }
  } finally {
    const leftovers = cleanTestArtifacts(tempStatePath);
    assert.deepEqual(leftovers, [], `Concurrent test leaked artifacts: ${leftovers.join(", ")}`);
  }
});