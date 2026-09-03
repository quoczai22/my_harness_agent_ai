import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { CheckpointType, ContextState, Stage, VALID_TRANSITIONS, Verdict } from "./types.js";

const getStatePath = () => resolve(process.env.CONTINUITY_STATE_PATH ?? ".continuity/state.json");
const getLockPath = () => `${getStatePath()}.lock`;
const now = () => new Date().toISOString();

const sleepSync = (ms: number) => {
  const sab = new SharedArrayBuffer(4);
  const int32 = new Int32Array(sab);
  Atomics.wait(int32, 0, 0, ms);
};

function emptyState(projectId: string): ContextState {
  return {
    projectId,
    currentChangeId: null,
    stage: "IDLE",
    blockers: [],
    lastUpdated: now(),
    tasks: [],
    checkpoints: [],
    scopeLog: [],
    decisions: []
  };
}

export class Store {
  private projectId: string;

  constructor(projectId = "default") {
    this.projectId = projectId;
    const path = getStatePath();
    if (!existsSync(path)) {
      this.withLock(() => {
        if (!existsSync(path)) {
          mkdirSync(dirname(path), { recursive: true });
          const initial = emptyState(this.projectId);
          this.save(initial);
        }
      });
    }
  }

  private acquireLock(timeoutMs = 15000) {
    const lockPath = getLockPath();
    const startTime = Date.now();
    mkdirSync(dirname(lockPath), { recursive: true });

    while (Date.now() - startTime < timeoutMs) {
      try {
        const fd = openSync(lockPath, "wx");
        const payload = JSON.stringify({ pid: process.pid, createdAt: Date.now() });
        writeFileSync(fd, payload, "utf8");
        closeSync(fd);
        return;
      } catch (err: any) {
        if (err?.code === "EEXIST" || err?.code === "EPERM" || err?.code === "EBUSY") {
          // Check for stale lock
          try {
            if (existsSync(lockPath)) {
              let isStale = false;
              let lockPid: number | null = null;
              let createdAt = 0;

              try {
                const content = JSON.parse(readFileSync(lockPath, "utf8"));
                lockPid = content.pid;
                createdAt = content.createdAt;
              } catch {
                const stat = statSync(lockPath);
                createdAt = stat.mtimeMs;
              }

              if (Date.now() - createdAt > 10000) {
                if (lockPid && typeof lockPid === "number") {
                  try {
                    process.kill(lockPid, 0);
                    // Process is still alive
                    isStale = false;
                  } catch (killErr: any) {
                    if (killErr?.code === "ESRCH") {
                      isStale = true; // Process is dead
                    }
                  }
                } else {
                  isStale = true;
                }
              }

              if (isStale) {
                try {
                  rmSync(lockPath, { force: true });
                } catch {}
                continue;
              }
            }
          } catch {}

          const delay = Math.floor(Math.random() * 20) + 10; // 10-30ms jitter
          sleepSync(delay);
          continue;
        }
        throw err;
      }
    }
    throw new Error(`Timeout acquiring lock for ${lockPath} after ${timeoutMs}ms`);
  }

  private releaseLock() {
    const lockPath = getLockPath();
    const startTime = Date.now();
    while (Date.now() - startTime < 5000) {
      try {
        if (existsSync(lockPath)) {
          rmSync(lockPath, { force: true });
        }
        return;
      } catch (err: any) {
        if (err?.code === "EPERM" || err?.code === "EBUSY") {
          sleepSync(5);
          continue;
        }
        return;
      }
    }
  }

  private withLock<T>(fn: () => T): T {
    this.acquireLock();
    try {
      return fn();
    } finally {
      this.releaseLock();
    }
  }

  private load(): ContextState {
    const path = getStatePath();
    if (!existsSync(path)) {
      const state = emptyState(this.projectId);
      this.save(state);
      return state;
    }
    return JSON.parse(readFileSync(path, "utf8"));
  }

  private save(state: ContextState) {
    state.lastUpdated = now();
    const path = getStatePath();
    mkdirSync(dirname(path), { recursive: true });
    const tempPath = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    writeFileSync(tempPath, JSON.stringify(state, null, 2) + "\n", "utf8");
    renameSync(tempPath, path);
  }

  private assertStage(state: ContextState, ...stages: Stage[]) {
    if (!stages.includes(state.stage)) {
      throw new Error(`State ${state.stage} does not allow this operation.`);
    }
  }

  getStatus() {
    const state = this.load();
    return {
      stage: state.stage,
      currentChangeId: state.currentChangeId,
      tasks: state.tasks.filter(t => t.changeId === state.currentChangeId),
      pendingCheckpoint: state.checkpoints.find(c => c.status === "PENDING"),
      blockers: state.blockers
    };
  }

  registerTask(changeId: string, tasks: { id: string; description: string; keywords: string[] }[]) {
    return this.withLock(() => {
      const state = this.load();
      this.assertStage(state, "IDLE", "SPEC_READY");
      if (!changeId.trim() || tasks.length === 0 || tasks.some(t => !t.id.trim() || t.keywords.length < 2)) {
        throw new Error("A change needs at least one task with an id and two technical keywords.");
      }
      if (state.currentChangeId && state.currentChangeId !== changeId && state.stage !== "IDLE") {
        throw new Error("Finish or reset the current change before registering another.");
      }
      state.currentChangeId = changeId;
      state.stage = "SPEC_READY";
      state.tasks = state.tasks.filter(t => t.changeId !== changeId);
      state.tasks.push(
        ...tasks.map(t => ({
          ...t,
          changeId,
          keywords: [...new Set(t.keywords.map(k => k.trim()).filter(Boolean))],
          status: "pending" as const,
          assignedRole: "developer" as const
        }))
      );
      this.save(state);
      return { ok: true, changeId };
    });
  }

  requestCheckpoint(changeId: string, type: CheckpointType, payload: string) {
    return this.withLock(() => {
      const state = this.load();
      const expected = type === "spec_review" ? "SPEC_READY" : "IMPL_DONE";
      this.assertStage(state, expected);
      if (changeId !== state.currentChangeId) {
        throw new Error("Checkpoint must belong to the current change.");
      }
      const checkpointId = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      state.checkpoints.push({ id: checkpointId, changeId, type, status: "PENDING", payload, createdAt: now() });
      state.stage = type === "spec_review" ? "CHECKPOINT_1" : "CHECKPOINT_2";
      this.save(state);
      return { checkpointId, status: "PENDING" as const };
    });
  }

  approveCheckpoint(checkpointId: string, decision: "APPROVED" | "REJECTED", reasoning: string) {
    return this.withLock(() => {
      const state = this.load();
      const cp = state.checkpoints.find(c => c.id === checkpointId);
      if (!cp || cp.status !== "PENDING") {
        throw new Error("A pending checkpoint with this id was not found.");
      }
      if (decision === "APPROVED" && state.blockers.length > 0) {
        throw new Error(`Cannot approve checkpoint while blockers exist: ${state.blockers.join(", ")}`);
      }
      this.assertStage(state, cp.type === "spec_review" ? "CHECKPOINT_1" : "CHECKPOINT_2");
      cp.status = decision;
      cp.reasoning = reasoning;
      cp.decidedAt = now();
      state.stage =
        cp.type === "spec_review"
          ? decision === "APPROVED"
            ? "IMPL_IN_PROGRESS"
            : "SPEC_READY"
          : decision === "APPROVED"
            ? "DONE"
            : "IMPL_IN_PROGRESS";
      state.decisions.push({ timestamp: now(), actor: "reviewer", decision, reasoning });
      this.save(state);
      return { ok: true, newStage: state.stage };
    });
  }

  checkScope(taskId: string, actionDescription: string, proposedBy: string) {
    return this.withLock(() => {
      const state = this.load();
      this.assertStage(state, "IMPL_IN_PROGRESS");
      const task = state.tasks.find(t => t.id === taskId && t.changeId === state.currentChangeId);
      let verdict: Verdict = "FLAGGED";
      let reason = "Task not found in the active change.";
      if (task) {
        const action = actionDescription.toLowerCase();
        const hits = task.keywords.filter(k => action.includes(k.toLowerCase()));
        const ratio = hits.length / task.keywords.length;
        if (ratio >= 0.5) {
          verdict = "IN_SCOPE";
          reason = `Matched ${hits.length}/${task.keywords.length}: ${hits.join(", ")}.`;
        } else if (hits.length === 0) {
          verdict = "OUT_OF_SCOPE";
          reason = `No keywords matched: ${task.keywords.join(", ")}.`;
        } else {
          reason = `Only ${hits.length}/${task.keywords.length} keywords matched: ${hits.join(", ")}.`;
        }
      }
      state.scopeLog.push({ taskId, timestamp: now(), actionDescription, verdict, reason, proposedBy });
      this.save(state);
      return { verdict, reason };
    });
  }

  setStatus(next: Stage, note: string, filesChanged: string[] = []) {
    return this.withLock(() => {
      const state = this.load();
      if (state.stage === "CHECKPOINT_1" || state.stage === "CHECKPOINT_2") {
        throw new Error("A pending checkpoint can only be resolved with approve_checkpoint.");
      }
      if (state.blockers.length > 0) {
        throw new Error(`Cannot advance status while blockers exist: ${state.blockers.join(", ")}`);
      }
      if (!VALID_TRANSITIONS[state.stage].includes(next)) {
        throw new Error(`Invalid state change: ${state.stage} -> ${next}.`);
      }
      state.stage = next;
      if (next === "IDLE") {
        state.currentChangeId = null;
      }
      state.decisions.push({
        timestamp: now(),
        actor: "system",
        decision: `stage:${next}`,
        reasoning: `${note}; files: ${filesChanged.join(", ")}`
      });
      this.save(state);
      return { ok: true, note, filesChanged };
    });
  }

  logDecision(actor: string, decision: string, reasoning: string) {
    return this.withLock(() => {
      const state = this.load();
      state.decisions.push({ timestamp: now(), actor, decision, reasoning });
      this.save(state);
      return { ok: true };
    });
  }

  raiseDiscussion(topic: string, rationale: string) {
    return this.withLock(() => {
      const state = this.load();
      if (!state.blockers.includes(topic)) {
        state.blockers.push(topic);
      }
      state.decisions.push({
        timestamp: now(),
        actor: "system",
        decision: `raise_discussion:${topic}`,
        reasoning: rationale
      });
      this.save(state);
      return { ok: true, blockers: state.blockers };
    });
  }

  resolveDiscussion(topic: string, resolution: string) {
    return this.withLock(() => {
      const state = this.load();
      state.blockers = state.blockers.filter(b => b !== topic);
      state.decisions.push({
        timestamp: now(),
        actor: "reviewer",
        decision: `resolve_discussion:${topic}`,
        reasoning: resolution
      });
      this.save(state);
      return { ok: true, blockers: state.blockers };
    });
  }
}
