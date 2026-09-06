import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, rmSync } from "node:fs";

const testState = ".continuity/test-unit-state.json";
process.env.CONTINUITY_STATE_PATH = testState;
if (existsSync(testState)) rmSync(testState);

const { Store } = await import("./store.js");

test("enforces checkpoints and scope checks", () => {
  if (existsSync(testState)) rmSync(testState);
  const store = new Store("test");
  store.registerTask("demo", [{ id: "t1", description: "Change the login validator", keywords: ["login.ts", "validateToken", "expiry"] }]);
  const cp1 = store.requestCheckpoint("demo", "spec_review", "ready");
  assert.throws(() => store.setStatus("IMPL_IN_PROGRESS", "bypass"));
  store.approveCheckpoint(cp1.checkpointId, "APPROVED", "approved");
  assert.equal(store.checkScope("t1", "update validateToken in login.ts", "test").verdict, "IN_SCOPE");
  assert.equal(store.checkScope("t1", "refactor home page", "test").verdict, "OUT_OF_SCOPE");
  store.setStatus("IMPL_DONE", "implemented", ["login.ts"]);
  const cp2 = store.requestCheckpoint("demo", "impl_review", "review");
  assert.equal(store.approveCheckpoint(cp2.checkpointId, "APPROVED", "approved").newStage, "IDLE");
});

test("enforces blocker gate on checkpoint approval", () => {
  if (existsSync(testState)) rmSync(testState);
  const store = new Store("test");
  store.registerTask("blocker-demo", [{ id: "t1", description: "Sample task", keywords: ["sample", "task"] }]);
  const cp = store.requestCheckpoint("blocker-demo", "spec_review", "ready for review");

  store.raiseDiscussion("security-concern", "Needs clarification on auth flow");
  assert.deepEqual(store.getStatus().blockers, ["security-concern"]);

  // approveCheckpoint must fail while blocker exists
  assert.throws(() => store.approveCheckpoint(cp.checkpointId, "APPROVED", "should fail"), /blocker/i);

  // after resolving discussion, approveCheckpoint succeeds
  store.resolveDiscussion("security-concern", "Auth flow clarified and verified");
  assert.deepEqual(store.getStatus().blockers, []);
  assert.equal(store.approveCheckpoint(cp.checkpointId, "APPROVED", "approved after resolution").newStage, "IMPL_IN_PROGRESS");
});

test("enforces universal blocker gate on setStatus transitions (including non-terminal transitions)", () => {
  if (existsSync(testState)) rmSync(testState);
  const store = new Store("test");
  store.registerTask("transition-blocker-demo", [{ id: "t1", description: "Task 1", keywords: ["task", "demo"] }]);
  const cp1 = store.requestCheckpoint("transition-blocker-demo", "spec_review", "ready");
  store.approveCheckpoint(cp1.checkpointId, "APPROVED", "approved");

  // At IMPL_IN_PROGRESS stage
  assert.equal(store.getStatus().stage, "IMPL_IN_PROGRESS");

  // 1. Block transition to IMPL_DONE when blocker exists
  store.raiseDiscussion("mid-impl-blocker", "Blocked during implementation");
  assert.throws(() => store.setStatus("IMPL_DONE", "attempt done"), /blocker/i);
  store.resolveDiscussion("mid-impl-blocker", "Resolved implementation blocker");
  assert.equal(store.setStatus("IMPL_DONE", "completed task", ["task.ts"]).ok, true);

  // Approved implementation review atomically returns the workflow to IDLE.
  const cp2 = store.requestCheckpoint("transition-blocker-demo", "impl_review", "review");
  store.approveCheckpoint(cp2.checkpointId, "APPROVED", "approved");
  assert.equal(store.getStatus().stage, "IDLE");
});

test("reloads fresh disk state across independent Store instances (no stale cache)", () => {
  if (existsSync(testState)) rmSync(testState);
  const store1 = new Store("test");
  const store2 = new Store("test");

  store1.registerTask("fresh-demo", [{ id: "t1", description: "Task 1", keywords: ["task", "fresh"] }]);

  // store2 must see the task registered by store1 immediately without re-instantiation
  const s2Status = store2.getStatus();
  assert.equal(s2Status.currentChangeId, "fresh-demo");
  assert.equal(s2Status.stage, "SPEC_READY");
  assert.equal(s2Status.tasks.length, 1);

  const cp = store2.requestCheckpoint("fresh-demo", "spec_review", "from store2");

  // store1 must see the checkpoint requested by store2
  const s1Status = store1.getStatus();
  assert.equal(s1Status.stage, "CHECKPOINT_1");
  assert.equal(s1Status.pendingCheckpoint?.id, cp.checkpointId);

  store1.approveCheckpoint(cp.checkpointId, "APPROVED", "approved by store1");

  // store2 must see the approval
  assert.equal(store2.getStatus().stage, "IMPL_IN_PROGRESS");
});


test("approved implementation review atomically completes history and allows the next change", () => {
  if (existsSync(testState)) rmSync(testState);
  const writer = new Store("test");
  const observer = new Store("test");
  writer.registerTask("completed-change", [
    { id: "t1", description: "First task", keywords: ["first", "task"] },
    { id: "t2", description: "Second task", keywords: ["second", "task"] }
  ]);
  const spec = writer.requestCheckpoint("completed-change", "spec_review", "ready");
  writer.approveCheckpoint(spec.checkpointId, "APPROVED", "spec accepted");
  writer.setStatus("IMPL_DONE", "implemented", ["src/store.ts"]);
  const review = writer.requestCheckpoint("completed-change", "impl_review", "ready for review");
  assert.equal(observer.approveCheckpoint(review.checkpointId, "APPROVED", "implementation accepted").newStage, "IDLE");

  const persisted = JSON.parse(readFileSync(testState, "utf8")) as { currentChangeId: string | null; stage: string; tasks: { changeId: string; status: string }[]; checkpoints: { id: string; status: string }[]; decisions: { decision: string }[] };
  assert.equal(persisted.currentChangeId, null);
  assert.equal(persisted.stage, "IDLE");
  assert.deepEqual(persisted.tasks.filter(task => task.changeId === "completed-change").map(task => task.status), ["done", "done"]);
  assert.equal(persisted.checkpoints.find(checkpoint => checkpoint.id === review.checkpointId)?.status, "APPROVED");
  assert.ok(persisted.decisions.some(entry => entry.decision === "complete_change:completed-change"));
  assert.equal(observer.getStatus().stage, "IDLE");
  observer.registerTask("next-change", [{ id: "next", description: "Next change", keywords: ["next", "change"] }]);
  assert.equal(writer.getStatus().currentChangeId, "next-change");
});

test("rejected implementation review keeps active tasks pending and returns to implementation", () => {
  if (existsSync(testState)) rmSync(testState);
  const store = new Store("test");
  store.registerTask("rejected-change", [{ id: "t1", description: "Task", keywords: ["task", "review"] }]);
  const spec = store.requestCheckpoint("rejected-change", "spec_review", "ready");
  store.approveCheckpoint(spec.checkpointId, "APPROVED", "spec accepted");
  store.setStatus("IMPL_DONE", "implemented", ["src/store.ts"]);
  const review = store.requestCheckpoint("rejected-change", "impl_review", "review");
  assert.equal(store.approveCheckpoint(review.checkpointId, "REJECTED", "needs revision").newStage, "IMPL_IN_PROGRESS");
  const persisted = JSON.parse(readFileSync(testState, "utf8")) as { currentChangeId: string | null; tasks: { changeId: string; status: string }[]; checkpoints: { id: string; status: string }[] };
  assert.equal(persisted.currentChangeId, "rejected-change");
  assert.deepEqual(persisted.tasks.filter(task => task.changeId === "rejected-change").map(task => task.status), ["pending"]);
  assert.equal(persisted.checkpoints.find(checkpoint => checkpoint.id === review.checkpointId)?.status, "REJECTED");
});