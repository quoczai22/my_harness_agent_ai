import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { CheckpointType, ContextState, Stage, VALID_TRANSITIONS, Verdict } from "./types.js";

const statePath = resolve(process.env.CONTINUITY_STATE_PATH ?? ".continuity/state.json");
const now = () => new Date().toISOString();

function emptyState(projectId: string): ContextState {
  return { projectId, currentChangeId: null, stage: "IDLE", blockers: [], lastUpdated: now(), tasks: [], checkpoints: [], scopeLog: [], decisions: [] };
}

export class Store {
  private state: ContextState;
  constructor(projectId = "default") { this.state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : emptyState(projectId); this.persist(); }
  private persist() { this.state.lastUpdated = now(); mkdirSync(dirname(statePath), { recursive: true }); writeFileSync(statePath, JSON.stringify(this.state, null, 2) + "\n", "utf8"); }
  private assertStage(...stages: Stage[]) { if (!stages.includes(this.state.stage)) throw new Error(`State ${this.state.stage} does not allow this operation.`); }
  getStatus() { return { stage: this.state.stage, currentChangeId: this.state.currentChangeId, tasks: this.state.tasks.filter(t => t.changeId === this.state.currentChangeId), pendingCheckpoint: this.state.checkpoints.find(c => c.status === "PENDING"), blockers: this.state.blockers }; }
  registerTask(changeId: string, tasks: { id: string; description: string; keywords: string[] }[]) {
    this.assertStage("IDLE", "SPEC_READY");
    if (!changeId.trim() || tasks.length === 0 || tasks.some(t => !t.id.trim() || t.keywords.length < 2)) throw new Error("A change needs at least one task with an id and two technical keywords.");
    if (this.state.currentChangeId && this.state.currentChangeId !== changeId) throw new Error("Finish or reset the current change before registering another.");
    this.state.currentChangeId = changeId; this.state.stage = "SPEC_READY";
    this.state.tasks = this.state.tasks.filter(t => t.changeId !== changeId);
    this.state.tasks.push(...tasks.map(t => ({ ...t, changeId, keywords: [...new Set(t.keywords.map(k => k.trim()).filter(Boolean))], status: "pending" as const, assignedRole: "developer" as const })));
    this.persist(); return { ok: true, changeId };
  }
  requestCheckpoint(changeId: string, type: CheckpointType, payload: string) {
    const expected = type === "spec_review" ? "SPEC_READY" : "IMPL_DONE"; this.assertStage(expected);
    if (changeId !== this.state.currentChangeId) throw new Error("Checkpoint must belong to the current change.");
    const checkpointId = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.state.checkpoints.push({ id: checkpointId, changeId, type, status: "PENDING", payload, createdAt: now() });
    this.state.stage = type === "spec_review" ? "CHECKPOINT_1" : "CHECKPOINT_2"; this.persist(); return { checkpointId, status: "PENDING" as const };
  }
  approveCheckpoint(checkpointId: string, decision: "APPROVED" | "REJECTED", reasoning: string) {
    const cp = this.state.checkpoints.find(c => c.id === checkpointId); if (!cp || cp.status !== "PENDING") throw new Error("A pending checkpoint with this id was not found.");
    this.assertStage(cp.type === "spec_review" ? "CHECKPOINT_1" : "CHECKPOINT_2"); cp.status = decision; cp.reasoning = reasoning; cp.decidedAt = now();
    this.state.stage = cp.type === "spec_review" ? (decision === "APPROVED" ? "IMPL_IN_PROGRESS" : "SPEC_READY") : (decision === "APPROVED" ? "DONE" : "IMPL_IN_PROGRESS");
    this.state.decisions.push({ timestamp: now(), actor: "reviewer", decision, reasoning }); this.persist(); return { ok: true, newStage: this.state.stage };
  }
  checkScope(taskId: string, actionDescription: string, proposedBy: string) {
    this.assertStage("IMPL_IN_PROGRESS"); const task = this.state.tasks.find(t => t.id === taskId && t.changeId === this.state.currentChangeId);
    let verdict: Verdict = "FLAGGED"; let reason = "Task not found in the active change.";
    if (task) { const action = actionDescription.toLowerCase(); const hits = task.keywords.filter(k => action.includes(k.toLowerCase())); const ratio = hits.length / task.keywords.length;
      if (ratio >= .5) { verdict = "IN_SCOPE"; reason = `Matched ${hits.length}/${task.keywords.length}: ${hits.join(", ")}.`; }
      else if (hits.length === 0) { verdict = "OUT_OF_SCOPE"; reason = `No keywords matched: ${task.keywords.join(", ")}.`; }
      else { reason = `Only ${hits.length}/${task.keywords.length} keywords matched: ${hits.join(", ")}.`; }
    }
    this.state.scopeLog.push({ taskId, timestamp: now(), actionDescription, verdict, reason, proposedBy }); this.persist(); return { verdict, reason };
  }
  setStatus(next: Stage, note: string, filesChanged: string[] = []) {
    if (this.state.stage === "CHECKPOINT_1" || this.state.stage === "CHECKPOINT_2") {
      throw new Error("A pending checkpoint can only be resolved with approve_checkpoint.");
    }
    if (!VALID_TRANSITIONS[this.state.stage].includes(next)) throw new Error(`Invalid state change: ${this.state.stage} -> ${next}.`);
    this.state.stage = next; this.state.decisions.push({ timestamp: now(), actor: "system", decision: `stage:${next}`, reasoning: `${note}; files: ${filesChanged.join(", ")}` }); this.persist(); return { ok: true, note, filesChanged };
  }
  logDecision(actor: string, decision: string, reasoning: string) { this.state.decisions.push({ timestamp: now(), actor, decision, reasoning }); this.persist(); return { ok: true }; }
}
