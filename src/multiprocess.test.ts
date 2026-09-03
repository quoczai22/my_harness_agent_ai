import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const tempStatePath = resolve(".continuity/test-multiprocess-state.json");

test("multi-process OS test with 3 distinct Node processes (different PIDs) verifying state handoff", () => {
  if (existsSync(tempStatePath)) {
    rmSync(tempStatePath);
  }

  const env = { ...process.env, CONTINUITY_STATE_PATH: tempStatePath };

  // 1. Process A: Create state, register task, request checkpoint
  const scriptA = `
    import('./dist/store.js').then(({ Store }) => {
      const store = new Store('mp-test');
      store.registerTask('mp-change', [{ id: 'mp-t1', description: 'Multiprocess task', keywords: ['multiprocess', 'node', 'test'] }]);
      const cp = store.requestCheckpoint('mp-change', 'spec_review', 'Payload from process A');
      console.log(JSON.stringify({
        pid: process.pid,
        statePath: process.env.CONTINUITY_STATE_PATH,
        stage: store.getStatus().stage,
        checkpointId: cp.checkpointId,
        pass: true,
        message: 'PASS: Process A created state, registered task, and requested checkpoint.'
      }));
    });
  `;

  const outA = JSON.parse(execSync(`node --input-type=module -e "${scriptA.replace(/\n/g, " ")}"`, { env, encoding: "utf8" }).trim());
  console.log(`[Process A] PID: ${outA.pid} | State: ${outA.statePath} | ${outA.message}`);
  assert.equal(outA.stage, "CHECKPOINT_1");
  assert.ok(outA.checkpointId);
  assert.equal(outA.pass, true);

  // 2. Process B: Read state from A, approve checkpoint, advance to IMPL_DONE, request impl_review
  const scriptB = `
    import('./dist/store.js').then(({ Store }) => {
      const store = new Store('mp-test');
      const status = store.getStatus();
      if (status.stage !== 'CHECKPOINT_1' || !status.pendingCheckpoint) {
        throw new Error('Process B: Expected stage CHECKPOINT_1 with pending checkpoint, got ' + status.stage);
      }
      store.approveCheckpoint(status.pendingCheckpoint.id, 'APPROVED', 'Process B approved spec_review');
      store.setStatus('IMPL_DONE', 'Process B finished implementation', ['src/store.ts']);
      const cp2 = store.requestCheckpoint('mp-change', 'impl_review', 'Process B requested impl review');
      console.log(JSON.stringify({
        pid: process.pid,
        statePath: process.env.CONTINUITY_STATE_PATH,
        stage: store.getStatus().stage,
        checkpointId: cp2.checkpointId,
        pass: true,
        message: 'PASS: Process B read state from A, approved checkpoint, set IMPL_DONE, and requested impl_review.'
      }));
    });
  `;

  const outB = JSON.parse(execSync(`node --input-type=module -e "${scriptB.replace(/\n/g, " ")}"`, { env, encoding: "utf8" }).trim());
  console.log(`[Process B] PID: ${outB.pid} | State: ${outB.statePath} | ${outB.message}`);
  assert.notEqual(outB.pid, outA.pid, "Process B must have a different PID than Process A");
  assert.equal(outB.stage, "CHECKPOINT_2");
  assert.ok(outB.checkpointId);
  assert.equal(outB.pass, true);

  // 3. Process C: Confirm changes from B, approve impl_review, and verify DONE
  const scriptC = `
    import('./dist/store.js').then(({ Store }) => {
      const store = new Store('mp-test');
      const status = store.getStatus();
      if (status.stage !== 'CHECKPOINT_2' || !status.pendingCheckpoint) {
        throw new Error('Process C: Expected stage CHECKPOINT_2 with pending checkpoint, got ' + status.stage);
      }
      store.approveCheckpoint(status.pendingCheckpoint.id, 'APPROVED', 'Process C approved impl_review');
      const finalStatus = store.getStatus();
      console.log(JSON.stringify({
        pid: process.pid,
        statePath: process.env.CONTINUITY_STATE_PATH,
        stage: finalStatus.stage,
        pass: true,
        message: 'PASS: Process C confirmed changes from B, approved impl_review, and verified final stage DONE.'
      }));
    });
  `;

  const outC = JSON.parse(execSync(`node --input-type=module -e "${scriptC.replace(/\n/g, " ")}"`, { env, encoding: "utf8" }).trim());
  console.log(`[Process C] PID: ${outC.pid} | State: ${outC.statePath} | ${outC.message}`);
  assert.notEqual(outC.pid, outA.pid, "Process C must have a different PID than Process A");
  assert.notEqual(outC.pid, outB.pid, "Process C must have a different PID than Process B");
  assert.equal(outC.stage, "DONE");
  assert.equal(outC.pass, true);

  if (existsSync(tempStatePath)) {
    rmSync(tempStatePath);
  }
});
