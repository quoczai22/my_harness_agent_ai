import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, rmSync } from "node:fs";

const testState = ".continuity/test-state.json";
process.env.CONTINUITY_STATE_PATH = testState;
const { Store } = await import("./store.js");
if (existsSync(testState)) rmSync(testState);

test("enforces checkpoints and scope checks", () => {
  const store = new Store("test");
  store.registerTask("demo", [{ id: "t1", description: "Change the login validator", keywords: ["login.ts", "validateToken", "expiry"] }]);
  const cp1 = store.requestCheckpoint("demo", "spec_review", "ready");
  assert.throws(() => store.setStatus("IMPL_IN_PROGRESS", "bypass"));
  store.approveCheckpoint(cp1.checkpointId, "APPROVED", "approved");
  assert.equal(store.checkScope("t1", "update validateToken in login.ts", "test").verdict, "IN_SCOPE");
  assert.equal(store.checkScope("t1", "refactor home page", "test").verdict, "OUT_OF_SCOPE");
  store.setStatus("IMPL_DONE", "implemented", ["login.ts"]);
  const cp2 = store.requestCheckpoint("demo", "impl_review", "review");
  assert.equal(store.approveCheckpoint(cp2.checkpointId, "APPROVED", "approved").newStage, "DONE");
});
