/**
 * The loop engine: runs queued tasks through a pipeline inside one Git
 * worktree per run, records every step as an event, and stops a task after
 * the pipeline's round limit.
 */
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  commandFor, loadAgentConfig, MAX_PROMPT_BYTES, parseVerdict, queryLocalModel, runProcess,
  type AgentConfig, type ProcessResult,
} from "./agentRunner.js";
import {
  changedFiles, commitAll, createRunWorktree, hasUncommittedChanges, matchesAny, removeRunWorktree,
  repoFingerprint, repositoryRoot, revertFiles, symlinkEscapes, worktreeDiff,
} from "./gitWorktree.js";
import { LoopStore, safeWorkspaceKey, type LoopEvent, type LoopRun, type LoopTask, type RepoCommands, type StageResult } from "./loopStore.js";
import { assertValidPipeline, DEFAULT_PIPELINE, LOCAL_MODEL_AGENTS, nextStageId, type PipelineDefinition, type PipelineStage } from "./pipeline.js";
import { buildContextPacket, buildProjectIndex } from "./universalHarness.js";

export interface LoopEngineOptions {
  /** Harness state directory, e.g. <harness>/.continuity/harness */
  stateRoot: string;
  agentConfigPath: string;
  /** Source for the first agent config; defaults to ~/agent-kit/config.json */
  agentKitConfigPath?: string;
}

interface ActiveRun {
  controller: AbortController;
  pauseRequested: boolean;
  wake?: (value: "resume" | "approve" | "reject") => void;
}

interface StageOutcome {
  passed: boolean;
  /** A configuration problem: block the task without spending a round. */
  blocking?: string;
  verdict?: "PASS" | "FAIL" | null;
  exitCode?: number | null;
  issues?: string;
  outputTail?: string;
}

const now = () => new Date().toISOString();
const tail = (text: string, size = 6_000) => (text.length > size ? `…${text.slice(-size)}` : text);

/** Reads Build/Test commands from INDEX.md (agent-run's convention) or package.json. */
export function detectRepoCommands(repoRoot: string): RepoCommands {
  const commands: RepoCommands = {};
  const indexPath = join(repoRoot, "INDEX.md");
  if (existsSync(indexPath)) {
    const text = readFileSync(indexPath, "utf8");
    for (const key of ["build", "test"] as const) {
      const match = new RegExp(`^\\s*-\\s*${key}\\s*:\\s*(.+)$`, "im").exec(text);
      const value = match?.[1].trim().replace(/^`|`$/g, "");
      if (value && !/^(none|không|-)$/i.test(value)) commands[key] = value;
    }
  }
  const pkgPath = join(repoRoot, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const scripts = JSON.parse(readFileSync(pkgPath, "utf8")).scripts ?? {};
      if (!commands.test && typeof scripts.test === "string" && !/no test specified/.test(scripts.test)) commands.test = "npm test";
      if (!commands.build && typeof scripts.build === "string") commands.build = "npm run build";
    } catch { /* not JSON: leave unset */ }
  }
  return commands;
}

export class LoopEngine extends EventEmitter {
  private readonly stores = new Map<string, LoopStore>();
  private readonly active = new Map<string, ActiveRun>();
  private readonly contexts = new Map<string, string>();

  constructor(private readonly options: LoopEngineOptions) {
    super();
    this.setMaxListeners(100);
  }

  store(workspaceId: string): LoopStore {
    const key = safeWorkspaceKey(workspaceId);
    let store = this.stores.get(key);
    if (!store) {
      store = new LoopStore(this.options.stateRoot, workspaceId);
      // Runs that were mid-flight when the server stopped cannot continue silently.
      store.update((state) => {
        for (const run of state.runs) {
          if (run.status === "running" || run.status === "paused" || run.status === "waiting-human") {
            run.status = "interrupted";
            run.updatedAt = now();
          }
        }
        for (const task of state.tasks) if (task.status === "running") task.status = "queued";
      });
      this.stores.set(key, store);
    }
    return store;
  }

  agentConfig(): AgentConfig {
    return loadAgentConfig(this.options.agentConfigPath, this.options.agentKitConfigPath);
  }

  // ---- tasks, pipeline, commands -------------------------------------------------

  addTasks(workspaceId: string, input: Array<Partial<LoopTask>>, source: "user" | "claude"): LoopTask[] {
    const created: LoopTask[] = [];
    this.store(workspaceId).update((state) => {
      for (const item of input.slice(0, 50)) {
        const title = typeof item.title === "string" ? item.title.trim().slice(0, 200) : "";
        if (!title) throw new Error("TASK_TITLE_REQUIRED");
        const task: LoopTask = {
          id: `T${state.tasks.length + created.length + 1}-${randomUUID().slice(0, 6)}`,
          title,
          description: typeof item.description === "string" ? item.description.slice(0, 8_000) : "",
          allowedFiles: Array.isArray(item.allowedFiles) ? item.allowedFiles.filter((p): p is string => typeof p === "string" && !!p.trim()).slice(0, 100) : [],
          acceptance: Array.isArray(item.acceptance) ? item.acceptance.filter((a): a is string => typeof a === "string" && !!a.trim()).slice(0, 30) : [],
          status: source === "claude" ? "proposal" : "queued",
          failedRounds: 0,
          source,
          createdAt: now(),
          updatedAt: now(),
        };
        created.push(task);
      }
      state.tasks.push(...created);
    });
    return created;
  }

  setTaskStatus(workspaceId: string, taskIds: string[], status: "queued" | "canceled"): LoopTask[] {
    return this.store(workspaceId).update((state) => {
      const changed: LoopTask[] = [];
      for (const task of state.tasks) {
        if (!taskIds.includes(task.id) || task.status === "running" || task.status === "passed") continue;
        task.status = status;
        if (status === "queued") task.failedRounds = 0;
        task.updatedAt = now();
        changed.push(task);
      }
      return changed;
    });
  }

  pipeline(workspaceId: string): PipelineDefinition {
    return this.store(workspaceId).read().pipeline ?? DEFAULT_PIPELINE;
  }

  setPipeline(workspaceId: string, value: unknown): PipelineDefinition {
    const def = assertValidPipeline(value);
    this.store(workspaceId).update((state) => { state.pipeline = def; });
    return def;
  }

  commands(workspaceId: string, repoRoot: string): RepoCommands {
    const saved = this.store(workspaceId).read().commands;
    return { ...detectRepoCommands(repoRoot), ...(saved ?? {}) };
  }

  setCommands(workspaceId: string, commands: RepoCommands): RepoCommands {
    const clean: RepoCommands = {};
    for (const key of ["build", "test"] as const) {
      const value = commands[key];
      if (typeof value === "string" && value.trim()) clean[key] = value.trim().slice(0, 500);
    }
    this.store(workspaceId).update((state) => { state.commands = clean; });
    return clean;
  }

  // ---- runs -----------------------------------------------------------------------

  activeRun(workspaceId: string): LoopRun | undefined {
    return this.store(workspaceId).read().runs.find((run) => this.active.has(run.id));
  }

  /** Starts a run over the workspace's queued tasks, or returns the one already running. */
  startRun(workspaceId: string, repoPath: string): LoopRun {
    const existing = this.activeRun(workspaceId);
    if (existing) return existing;
    const store = this.store(workspaceId);
    if (!store.read().tasks.some((task) => task.status === "queued")) throw new Error("NO_QUEUED_TASKS");
    const repoRoot = repositoryRoot(repoPath);
    const pipeline = assertValidPipeline(this.pipeline(workspaceId));
    const id = `run-${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}-${randomUUID().slice(0, 6)}`;
    const worktree = join(this.options.stateRoot, "worktrees", safeWorkspaceKey(workspaceId), id);
    mkdirSync(join(this.options.stateRoot, "worktrees", safeWorkspaceKey(workspaceId)), { recursive: true });
    const branch = `harness/${id}`;
    const { base } = createRunWorktree(repoRoot, worktree, branch);
    const run: LoopRun = {
      id, workspaceId, repoRoot, pipeline, branch, worktree, base,
      status: "running", stageResults: {}, doneTaskIds: [], createdAt: now(), updatedAt: now(),
    };
    store.update((state) => { state.runs.push(run); });
    this.emitEvent(workspaceId, { runId: id, type: "run-started", data: { branch, base, repoDirty: hasUncommittedChanges(repoRoot) } });
    this.launch(workspaceId, run.id, false);
    return run;
  }

  /** Continues a blocked, interrupted or paused run; a blocked task gets fresh rounds. */
  resume(workspaceId: string, runId: string): LoopRun {
    const handle = this.active.get(runId);
    if (handle) {
      handle.pauseRequested = false;
      handle.wake?.("resume");
      return this.getRun(workspaceId, runId);
    }
    const run = this.getRun(workspaceId, runId);
    if (!["blocked", "interrupted", "failed"].includes(run.status)) throw new Error("RUN_NOT_RESUMABLE");
    if (this.activeRun(workspaceId)) throw new Error("ANOTHER_RUN_ACTIVE");
    if (!existsSync(run.worktree)) throw new Error("WORKTREE_MISSING");
    this.store(workspaceId).update((state) => {
      const task = state.tasks.find((t) => t.id === run.currentTaskId);
      if (task && task.status === "blocked") { task.status = "queued"; task.failedRounds = 0; task.updatedAt = now(); }
    });
    this.patchRun(workspaceId, runId, { status: "running", error: undefined });
    this.emitEvent(workspaceId, { runId, type: "resumed" });
    this.launch(workspaceId, runId, true);
    return this.getRun(workspaceId, runId);
  }

  pause(workspaceId: string, runId: string): void {
    const handle = this.active.get(runId);
    if (!handle) throw new Error("RUN_NOT_ACTIVE");
    handle.pauseRequested = true;
  }

  cancel(workspaceId: string, runId: string): void {
    const handle = this.active.get(runId);
    if (!handle) throw new Error("RUN_NOT_ACTIVE");
    handle.controller.abort();
    handle.wake?.("reject");
  }

  answerHuman(workspaceId: string, runId: string, approve: boolean): void {
    const handle = this.active.get(runId);
    const run = this.getRun(workspaceId, runId);
    if (!handle || run.status !== "waiting-human") throw new Error("RUN_NOT_WAITING");
    handle.wake?.(approve ? "approve" : "reject");
  }

  getRun(workspaceId: string, runId: string): LoopRun {
    const run = this.store(workspaceId).read().runs.find((r) => r.id === runId);
    if (!run) throw new Error("RUN_NOT_FOUND");
    return run;
  }

  /** Resolves when the run stops working (tests and shutdown). */
  async waitForIdle(runId: string, timeoutMs = 60_000): Promise<void> {
    const start = Date.now();
    while (this.active.has(runId)) {
      if (Date.now() - start > timeoutMs) throw new Error("WAIT_TIMEOUT");
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  stopAll(): void {
    for (const handle of this.active.values()) { handle.controller.abort(); handle.wake?.("reject"); }
  }

  // ---- internals ------------------------------------------------------------------

  private emitEvent(workspaceId: string, event: Omit<LoopEvent, "seq" | "at">): LoopEvent {
    const full = this.store(workspaceId).appendEvent(event);
    this.emit("event", workspaceId, full);
    return full;
  }

  private patchRun(workspaceId: string, runId: string, patch: Partial<LoopRun>): void {
    this.store(workspaceId).update((state) => {
      const run = state.runs.find((r) => r.id === runId);
      if (run) Object.assign(run, patch, { updatedAt: now() });
    });
  }

  private patchTask(workspaceId: string, taskId: string, patch: Partial<LoopTask>): void {
    this.store(workspaceId).update((state) => {
      const task = state.tasks.find((t) => t.id === taskId);
      if (task) Object.assign(task, patch, { updatedAt: now() });
    });
  }

  private setStageResult(workspaceId: string, runId: string, stageId: string, result: StageResult): void {
    this.store(workspaceId).update((state) => {
      const run = state.runs.find((r) => r.id === runId);
      if (run) { run.stageResults[stageId] = result; run.updatedAt = now(); }
    });
  }

  private launch(workspaceId: string, runId: string, resuming: boolean): void {
    const handle: ActiveRun = { controller: new AbortController(), pauseRequested: false };
    this.active.set(runId, handle);
    this.execute(workspaceId, runId, handle, resuming)
      .catch((err: any) => {
        this.patchRun(workspaceId, runId, { status: "failed", error: String(err?.message ?? err) });
        this.emitEvent(workspaceId, { runId, type: "run-finished", data: { status: "failed", error: String(err?.message ?? err) } });
      })
      .finally(() => this.active.delete(runId));
  }

  private waitFor(handle: ActiveRun): Promise<"resume" | "approve" | "reject"> {
    return new Promise((resolvePromise) => {
      if (handle.controller.signal.aborted) return resolvePromise("reject");
      handle.wake = (value) => { handle.wake = undefined; resolvePromise(value); };
    });
  }

  private async execute(workspaceId: string, runId: string, handle: ActiveRun, resuming: boolean): Promise<void> {
    const store = this.store(workspaceId);
    let resumeStage = resuming ? this.getRun(workspaceId, runId).currentStageId : undefined;
    let resumeTask = resuming ? this.getRun(workspaceId, runId).currentTaskId : undefined;

    for (;;) {
      if (handle.controller.signal.aborted) return this.finishCanceled(workspaceId, runId);
      const state = store.read();
      const task = (resumeTask && state.tasks.find((t) => t.id === resumeTask && t.status === "queued"))
        || state.tasks.find((t) => t.status === "queued");
      if (!task) break;
      const run = this.getRun(workspaceId, runId);
      const def = run.pipeline;
      let stageId: string | null = resumeTask === task.id && resumeStage ? resumeStage : def.stages[0].id;
      resumeTask = undefined;
      resumeStage = undefined;
      this.patchTask(workspaceId, task.id, { status: "running", runId });
      this.patchRun(workspaceId, runId, { currentTaskId: task.id, currentStageId: stageId, stageResults: {} });
      this.emitEvent(workspaceId, { runId, type: "task-started", taskId: task.id, data: { title: task.title } });
      let failedRounds = task.failedRounds;

      while (stageId) {
        if (handle.controller.signal.aborted) return this.finishCanceled(workspaceId, runId, task.id);
        if (handle.pauseRequested) {
          this.patchRun(workspaceId, runId, { status: "paused" });
          this.emitEvent(workspaceId, { runId, type: "paused", taskId: task.id, stageId });
          const answer = await this.waitFor(handle);
          if (answer === "reject" || handle.controller.signal.aborted) return this.finishCanceled(workspaceId, runId, task.id);
          this.patchRun(workspaceId, runId, { status: "running" });
          this.emitEvent(workspaceId, { runId, type: "resumed", taskId: task.id, stageId });
        }
        const stage = def.stages.find((s) => s.id === stageId) as PipelineStage;
        const round = failedRounds + 1;
        this.patchRun(workspaceId, runId, { currentStageId: stageId });
        this.setStageResult(workspaceId, runId, stageId, { status: "running", round, at: now() });
        this.emitEvent(workspaceId, { runId, type: "stage-started", taskId: task.id, stageId, agent: stage.agent, data: { kind: stage.kind, round } });

        const current = store.read().tasks.find((t) => t.id === task.id) as LoopTask;
        const guarded = stage.kind === "agent" || stage.kind === "command" || stage.kind === "gate";
        const repoBefore = guarded ? repoFingerprint(run.repoRoot) : "";
        let outcome = stage.kind === "human"
          ? await this.humanStage(workspaceId, runId, handle, current, stage)
          : await this.runStage(workspaceId, this.getRun(workspaceId, runId), current, stage, handle, failedRounds);
        if (guarded && !handle.controller.signal.aborted && repoFingerprint(run.repoRoot) !== repoBefore) {
          // The imported repository must only change through a merge the user makes.
          outcome = {
            ...outcome, passed: false,
            blocking: `"${stage.label ?? stage.id}" changed the imported repository at ${run.repoRoot} (its HEAD, branch or working files), outside the run worktree. Check that repository by hand; the run stopped so nothing else is touched.`,
          };
        }
        if (handle.controller.signal.aborted) return this.finishCanceled(workspaceId, runId, task.id);

        this.setStageResult(workspaceId, runId, stageId, {
          status: outcome.passed ? "passed" : "failed", round, verdict: outcome.verdict, exitCode: outcome.exitCode,
          issues: outcome.issues, outputTail: outcome.outputTail, at: now(),
        });
        this.emitEvent(workspaceId, {
          runId, type: "stage-finished", taskId: task.id, stageId, agent: stage.agent,
          data: { passed: outcome.passed, verdict: outcome.verdict ?? null, exitCode: outcome.exitCode ?? null, issues: outcome.issues ?? "", round },
        });

        if (outcome.blocking) {
          return this.blockTask(workspaceId, runId, task.id, outcome.blocking, failedRounds);
        }
        if (!outcome.passed) {
          failedRounds += 1;
          this.patchTask(workspaceId, task.id, { failedRounds, lastIssues: outcome.issues });
          this.emitEvent(workspaceId, { runId, type: "round", taskId: task.id, stageId, data: { failedRounds, maxRounds: def.maxRounds } });
          if (failedRounds >= def.maxRounds) {
            return this.blockTask(workspaceId, runId, task.id, `Failed ${failedRounds} rounds; last failure at "${stage.label ?? stage.id}".`, failedRounds);
          }
        }
        stageId = nextStageId(def, stage.id, outcome.passed);
      }

      this.patchTask(workspaceId, task.id, { status: "passed", lastIssues: undefined });
      this.patchRun(workspaceId, runId, { doneTaskIds: [...this.getRun(workspaceId, runId).doneTaskIds, task.id], currentStageId: undefined });
      this.emitEvent(workspaceId, { runId, type: "task-passed", taskId: task.id });
    }

    const run = this.getRun(workspaceId, runId);
    const leftover = changedFiles(run.worktree).length > 0;
    if (!leftover) removeRunWorktree(run.repoRoot, run.worktree);
    this.patchRun(workspaceId, runId, { status: "completed", currentTaskId: undefined, currentStageId: undefined });
    this.emitEvent(workspaceId, { runId, type: "run-finished", data: { status: "completed", branch: run.branch, worktreeKept: leftover } });
  }

  private finishCanceled(workspaceId: string, runId: string, taskId?: string): void {
    if (taskId) this.patchTask(workspaceId, taskId, { status: "queued" });
    this.patchRun(workspaceId, runId, { status: "canceled" });
    this.emitEvent(workspaceId, { runId, type: "run-finished", taskId, data: { status: "canceled" } });
  }

  private blockTask(workspaceId: string, runId: string, taskId: string, reason: string, failedRounds: number): void {
    this.patchTask(workspaceId, taskId, { status: "blocked", failedRounds, lastIssues: reason });
    this.patchRun(workspaceId, runId, { status: "blocked", error: reason });
    this.emitEvent(workspaceId, { runId, type: "task-blocked", taskId, data: { reason, failedRounds } });
    this.emitEvent(workspaceId, { runId, type: "run-finished", taskId, data: { status: "blocked", reason } });
  }

  private async humanStage(workspaceId: string, runId: string, handle: ActiveRun, task: LoopTask, stage: PipelineStage): Promise<StageOutcome> {
    this.patchRun(workspaceId, runId, { status: "waiting-human" });
    this.emitEvent(workspaceId, { runId, type: "waiting-human", taskId: task.id, stageId: stage.id });
    const answer = await this.waitFor(handle);
    this.patchRun(workspaceId, runId, { status: "running" });
    if (answer === "approve") return { passed: true };
    return { passed: false, issues: "Rejected by the user at a human checkpoint." };
  }

  private async runStage(
    workspaceId: string, run: LoopRun, task: LoopTask, stage: PipelineStage, handle: ActiveRun, failedRounds: number,
  ): Promise<StageOutcome> {
    const signal = handle.controller.signal;
    const config = this.agentConfig();
    const onOutput = (agent?: string) => {
      let sent = 0;
      return (chunk: string) => {
        if (sent > 200_000) return;
        sent += chunk.length;
        this.emitEvent(workspaceId, { runId: run.id, type: "output", taskId: task.id, stageId: stage.id, agent, data: { text: chunk } });
      };
    };

    if (stage.kind === "context") {
      const text = this.buildContext(run.worktree, workspaceId, stage.sources ?? []);
      this.contexts.set(run.id, text);
      return { passed: true, outputTail: tail(text, 2_000) };
    }

    if (stage.kind === "commit") {
      const sha = commitAll(run.worktree, `harness: ${task.title} (${task.id})\n\nRun ${run.id}, pipeline ${run.pipeline.id}. Review passed.`);
      this.patchTask(workspaceId, task.id, { commit: sha ?? undefined });
      this.emitEvent(workspaceId, { runId: run.id, type: "commit", taskId: task.id, stageId: stage.id, data: { sha, branch: run.branch } });
      return { passed: true, outputTail: sha ? `Committed ${sha}` : "Nothing to commit" };
    }

    let commandResult: ProcessResult | undefined;
    if (stage.kind === "command" || stage.kind === "gate") {
      const command = this.commands(workspaceId, run.repoRoot)[stage.command as "build" | "test"];
      if (!command) return { passed: false, blocking: `No ${stage.command} command is set for this repository. Set it in the pipeline panel.` };
      commandResult = await runProcess(["sh", "-c", command], {
        cwd: run.worktree, timeoutMs: config.timeouts.buildMinutes * 60_000, signal, onOutput: onOutput(stage.command),
      });
      if (stage.kind === "command") {
        const passed = commandResult.exitCode === 0;
        return {
          passed, exitCode: commandResult.exitCode, outputTail: tail(commandResult.output),
          issues: passed ? undefined : `\`${command}\` failed (${describeExit(commandResult)}).\n${tail(commandResult.output, 4_000)}`,
        };
      }
    }

    const agent = stage.agent as NonNullable<PipelineStage["agent"]>;
    const role = stage.role as NonNullable<PipelineStage["role"]>;
    if (!this.contexts.has(run.id)) {
      // After a restart the in-memory context is gone; rebuild it from the pipeline's context stage.
      const contextStage = run.pipeline.stages.find((s) => s.kind === "context");
      if (contextStage) this.contexts.set(run.id, this.buildContext(run.worktree, workspaceId, contextStage.sources ?? []));
    }
    const needsVerdict = role === "test" || role === "review";
    const prompt = this.buildPrompt(run, task, stage, failedRounds, commandResult);
    const diffBefore = role === "implement" ? "" : worktreeDiff(run.worktree, 400_000);

    let result: ProcessResult | undefined;
    let verdict = parseVerdict("");
    for (let attempt = 0; attempt < (needsVerdict ? 2 : 1); attempt++) {
      const timeoutMs = (role === "implement" ? config.timeouts.workerMinutes : config.timeouts.reviewMinutes) * 60_000;
      if (LOCAL_MODEL_AGENTS.includes(agent)) {
        result = await queryLocalModel(config, agent as "lmstudio" | "ollama", prompt, { timeoutMs, signal });
        if (result.output) onOutput(agent)(result.output);
      } else {
        let argv: string[];
        try { argv = commandFor(config, agent, role, prompt); } catch (err: any) { return { passed: false, blocking: String(err?.message ?? err) }; }
        result = await runProcess(argv, { cwd: run.worktree, timeoutMs, signal, onOutput: onOutput(agent) });
      }
      if (result.canceled) return { passed: false };
      if (result.error && /Command not found|not reachable|Set models\.|endpoint/.test(result.error)) {
        return { passed: false, blocking: `${agent}: ${result.error}` };
      }
      const quota = result.exitCode !== 0 ? quotaMessage(result.output) : undefined;
      if (quota) {
        // Running out of quota is not the implementer's fault: stop instead of spending rounds.
        return { passed: false, blocking: `${agent} is out of quota or rate-limited: ${quota}`, exitCode: result.exitCode, outputTail: tail(result.output) };
      }
      verdict = parseVerdict(result.output);
      if (!needsVerdict || verdict.verdict) break;
      this.emitEvent(workspaceId, { runId: run.id, type: "warning", taskId: task.id, stageId: stage.id, agent, data: { message: "No VERDICT line; asking once more." } });
    }
    const agentResult = result as ProcessResult;

    if (role !== "implement" && worktreeDiff(run.worktree, 400_000) !== diffBefore) {
      this.emitEvent(workspaceId, { runId: run.id, type: "warning", taskId: task.id, stageId: stage.id, agent, data: { message: `${agent} changed files during a ${role} stage; check its agent config uses a read-only mode.` } });
    }

    if (role === "implement") {
      if (agentResult.exitCode !== 0) {
        return { passed: false, exitCode: agentResult.exitCode, outputTail: tail(agentResult.output), issues: `${agent} did not finish (${describeExit(agentResult)}).\n${tail(agentResult.output, 3_000)}` };
      }
      const changed = changedFiles(run.worktree).map((file) => file.path);
      const escaping = changed.filter((path) => symlinkEscapes(run.worktree, path));
      if (escaping.length) {
        revertFiles(run.worktree, escaping);
        return { passed: false, exitCode: 0, outputTail: tail(agentResult.output), issues: `Symlinks pointing outside the worktree are not allowed (reverted): ${escaping.join(", ")}` };
      }
      const outOfScope = task.allowedFiles.length ? changed.filter((path) => !matchesAny(path, task.allowedFiles)) : [];
      if (outOfScope.length) {
        revertFiles(run.worktree, outOfScope);
        return { passed: false, exitCode: 0, outputTail: tail(agentResult.output), issues: `Changed files outside the allowed list (reverted): ${outOfScope.join(", ")}` };
      }
      if (changed.length === 0) {
        return { passed: false, exitCode: 0, outputTail: tail(agentResult.output), issues: `${agent} finished without changing any file.` };
      }
      return { passed: true, exitCode: 0, outputTail: tail(agentResult.output) };
    }

    const exitOk = agentResult.exitCode === 0 || LOCAL_MODEL_AGENTS.includes(agent);
    if (!needsVerdict) return { passed: exitOk, exitCode: agentResult.exitCode, outputTail: tail(agentResult.output) };

    const commandOk = commandResult ? commandResult.exitCode === 0 : true;
    // An agent that exited with an error cannot pass, whatever text it printed.
    const passed = commandOk && exitOk && verdict.verdict === "PASS";
    const problems: string[] = [];
    if (commandResult && !commandOk) problems.push(`Test command failed (${describeExit(commandResult)}):\n${tail(commandResult.output, 4_000)}`);
    if (!exitOk) problems.push(`${agent} exited with an error (${describeExit(agentResult)}):\n${tail(agentResult.output, 2_000)}`);
    else if (!verdict.verdict) problems.push(`${agent} gave no VERDICT line (${describeExit(agentResult)}).`);
    else if (verdict.verdict === "FAIL") problems.push(`${agent} verdict FAIL:\n${verdict.issues || "(no issues listed)"}`);
    return {
      passed, verdict: verdict.verdict, exitCode: commandResult?.exitCode ?? agentResult.exitCode,
      outputTail: tail(agentResult.output), issues: passed ? undefined : problems.join("\n\n"),
    };
  }

  private buildContext(worktree: string, workspaceId: string, sources: string[]): string {
    const index = buildProjectIndex(worktree);
    const selected: string[] = [];
    for (const source of sources) {
      const prefix = source.replace(/\\/g, "/").replace(/^\.\//, "");
      for (const file of index.files) {
        if (file.path === prefix || (prefix.endsWith("/") && file.path.startsWith(prefix))) selected.push(file.path);
        if (selected.length >= 40) break;
      }
    }
    const packet = buildContextPacket(worktree, workspaceId, { prompt: "", selectedPaths: selected, maxCharacters: 40_000 });
    const parts = [`Project: ${packet.projectName}`, `Technologies: ${packet.technologies.join(", ") || "unknown"}`];
    for (const doc of [...packet.instructions, ...packet.files]) parts.push(`--- ${doc.path} ---\n${doc.content}`);
    return parts.join("\n\n");
  }

  private buildPrompt(run: LoopRun, task: LoopTask, stage: PipelineStage, failedRounds: number, commandResult?: ProcessResult): string {
    const role = stage.role;
    const lines: string[] = [];
    const roleText: Record<string, string> = {
      implement: "You are the implementer in a supervised agent loop. Make the change directly in the files of the current directory (a Git worktree reserved for this run). Do not commit, push, switch branches or create worktrees.",
      test: "You are the tester in a supervised agent loop. Check whether the change in the current directory meets the task's acceptance criteria and works. Do not edit files.",
      review: "You are the reviewer in a supervised agent loop. Review the diff below against the task and its acceptance criteria: correctness, scope, and anything that would break. Do not edit files.",
      plan: "You are the planner in a supervised agent loop. Read the task and the project context and describe the steps. Do not edit files.",
    };
    lines.push(roleText[role ?? "plan"]);
    lines.push(`\n# Task ${task.id}: ${task.title}`);
    if (task.description) lines.push(task.description);
    if (task.acceptance.length) lines.push(`\n## Acceptance criteria\n${task.acceptance.map((a) => `- ${a}`).join("\n")}`);
    if (task.allowedFiles.length) lines.push(`\n## Files you may change\n${task.allowedFiles.map((f) => `- ${f}`).join("\n")}\nChanges to any other file are reverted and count as a failed round.`);
    if (failedRounds > 0 && task.lastIssues) lines.push(`\n## The previous round failed (${failedRounds} of ${run.pipeline.maxRounds} rounds used)\nFix this:\n${tail(task.lastIssues, 8_000)}`);
    if (commandResult) lines.push(`\n## Test command result (${describeExit(commandResult)})\n${tail(commandResult.output, 8_000)}`);
    if (role === "test" || role === "review") {
      lines.push(`\n## Diff against the run's starting point\n${worktreeDiff(run.worktree, 40_000) || "(no changes)"}`);
      lines.push("\nEnd your answer with exactly these lines:\nVERDICT: PASS or VERDICT: FAIL\nISSUES:\n- one line per problem the implementer must fix (empty when PASS)");
    }
    if (role === "implement") lines.push("\nWhen done, end with a short summary of what you changed.");
    const context = this.contexts.get(run.id);
    let prompt = lines.join("\n");
    if (context) {
      const room = MAX_PROMPT_BYTES - Buffer.byteLength(prompt, "utf8") - 200;
      if (room > 1_000) {
        let ctx = context;
        while (Buffer.byteLength(ctx, "utf8") > room) ctx = ctx.slice(0, Math.floor(ctx.length * 0.8));
        prompt += `\n\n# Project context\n${ctx}`;
      }
    }
    while (Buffer.byteLength(prompt, "utf8") > MAX_PROMPT_BYTES) prompt = prompt.slice(0, Math.floor(prompt.length * 0.9));
    return prompt;
  }
}

const QUOTA_PATTERN = /(usage limit|rate[ -]?limit|quota|too many requests|\b429\b|credit balance)/i;

/** The first output line that says the agent ran out of quota, if any. */
export function quotaMessage(output: string): string | undefined {
  const line = output.split("\n").find((l) => QUOTA_PATTERN.test(l));
  return line ? line.trim().slice(0, 300) : undefined;
}

function describeExit(result: ProcessResult): string {
  if (result.canceled) return "canceled";
  if (result.timedOut) return "timed out";
  if (result.error) return result.error;
  return `exit code ${result.exitCode}`;
}
