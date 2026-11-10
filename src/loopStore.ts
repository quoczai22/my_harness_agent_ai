/**
 * Durable state for the loop engine, kept per workspace in the Harness state
 * directory (never in the imported repository): tasks, runs, the chosen
 * pipeline and repository commands in state.json, and one JSONL event log
 * per run.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PipelineDefinition } from "./pipeline.js";

export type TaskStatus = "proposal" | "queued" | "running" | "passed" | "blocked" | "canceled";

export interface LoopTask {
  id: string;
  title: string;
  description: string;
  allowedFiles: string[];
  acceptance: string[];
  status: TaskStatus;
  failedRounds: number;
  runId?: string;
  commit?: string;
  lastIssues?: string;
  source: "user" | "claude";
  createdAt: string;
  updatedAt: string;
}

export type RunStatus = "running" | "paused" | "waiting-human" | "blocked" | "completed" | "canceled" | "interrupted" | "failed";
export type StageStatus = "waiting" | "running" | "passed" | "failed" | "skipped";

export interface StageResult {
  status: StageStatus;
  round: number;
  verdict?: "PASS" | "FAIL" | null;
  exitCode?: number | null;
  issues?: string;
  outputTail?: string;
  at: string;
}

export interface LoopRun {
  id: string;
  workspaceId: string;
  repoRoot: string;
  pipeline: PipelineDefinition;
  branch: string;
  worktree: string;
  base: string;
  status: RunStatus;
  currentTaskId?: string;
  currentStageId?: string;
  stageResults: Record<string, StageResult>;
  doneTaskIds: string[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RepoCommands { build?: string; test?: string }

export interface LoopState {
  tasks: LoopTask[];
  runs: LoopRun[];
  pipeline?: PipelineDefinition;
  commands?: RepoCommands;
}

export type LoopEventType =
  | "run-started" | "task-started" | "stage-started" | "output" | "stage-finished" | "round"
  | "commit" | "task-passed" | "task-blocked" | "waiting-human" | "paused" | "resumed"
  | "warning" | "run-finished";

export interface LoopEvent {
  seq: number;
  at: string;
  runId: string;
  type: LoopEventType;
  taskId?: string;
  stageId?: string;
  agent?: string;
  data?: Record<string, unknown>;
}

export function safeWorkspaceKey(workspaceId: string): string {
  return workspaceId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80) || "default";
}

export class LoopStore {
  readonly dir: string;
  private seq = new Map<string, number>();

  constructor(stateRoot: string, workspaceId: string) {
    this.dir = join(stateRoot, "loop", safeWorkspaceKey(workspaceId));
    mkdirSync(join(this.dir, "runs"), { recursive: true });
  }

  private get statePath(): string { return join(this.dir, "state.json"); }

  read(): LoopState {
    if (!existsSync(this.statePath)) return { tasks: [], runs: [] };
    try {
      const raw = JSON.parse(readFileSync(this.statePath, "utf8"));
      return {
        tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
        runs: Array.isArray(raw.runs) ? raw.runs : [],
        pipeline: raw.pipeline,
        commands: raw.commands,
      };
    } catch {
      throw new Error(`LOOP_STATE_CORRUPT: ${this.statePath}`);
    }
  }

  /** Read-modify-write; the server is one process, so calls never interleave. */
  update<T>(fn: (state: LoopState) => T): T {
    const state = this.read();
    const result = fn(state);
    const tmp = `${this.statePath}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
    renameSync(tmp, this.statePath);
    return result;
  }

  private eventsPath(runId: string): string {
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(runId)) throw new Error("INVALID_RUN_ID");
    return join(this.dir, "runs", `${runId}.jsonl`);
  }

  appendEvent(event: Omit<LoopEvent, "seq" | "at">): LoopEvent {
    let seq = this.seq.get(event.runId);
    if (seq === undefined) seq = this.readEvents(event.runId).length;
    const full: LoopEvent = { seq: seq + 1, at: new Date().toISOString(), ...event };
    this.seq.set(event.runId, full.seq);
    appendFileSync(this.eventsPath(event.runId), `${JSON.stringify(full)}\n`, "utf8");
    return full;
  }

  readEvents(runId: string, afterSeq = 0): LoopEvent[] {
    const path = this.eventsPath(runId);
    if (!existsSync(path)) return [];
    const events: LoopEvent[] = [];
    for (const line of readFileSync(path, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as LoopEvent;
        if (event.seq > afterSeq) events.push(event);
      } catch { /* a torn last line after a crash is skipped */ }
    }
    return events;
  }
}
