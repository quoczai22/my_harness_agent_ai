/**
 * Pipelines are data: an ordered list of stages with optional pass/fail
 * transitions. A failure may return to an earlier stage (a new round); a pass
 * may only move forward, so every loop is bounded by the round limit.
 */

export type AgentId = "claude" | "codex" | "antigravity" | "lmstudio" | "ollama";
export type AgentRole = "plan" | "implement" | "test" | "review";
export type StageKind = "context" | "agent" | "command" | "gate" | "human" | "commit";
export type RepoCommand = "build" | "test";

export interface PipelineStage {
  id: string;
  kind: StageKind;
  label?: string;
  agent?: AgentId;
  role?: AgentRole;
  command?: RepoCommand;
  sources?: string[];
  onPass?: string;
  onFail?: string;
}

export interface PipelineDefinition {
  id: string;
  name: string;
  maxRounds: number;
  stages: PipelineStage[];
}

export const AGENT_IDS: readonly AgentId[] = ["claude", "codex", "antigravity", "lmstudio", "ollama"];
/** Agents reached over a local HTTP API: they read and judge, but cannot edit files. */
export const LOCAL_MODEL_AGENTS: readonly AgentId[] = ["lmstudio", "ollama"];
const ROLES: readonly AgentRole[] = ["plan", "implement", "test", "review"];
const KINDS: readonly StageKind[] = ["context", "agent", "command", "gate", "human", "commit"];
const COMMANDS: readonly RepoCommand[] = ["build", "test"];
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

export const DEFAULT_PIPELINE: PipelineDefinition = {
  id: "ui-test-review",
  name: "Antigravity builds, Codex tests, Claude reviews",
  maxRounds: 3,
  stages: [
    { id: "context", kind: "context", label: "Project documents", sources: ["README.md", "AGENTS.md", "DESIGN.md", "INDEX.md"] },
    { id: "build-ui", kind: "agent", label: "Antigravity implements", agent: "antigravity", role: "implement" },
    { id: "test", kind: "gate", label: "Codex tests", command: "test", agent: "codex", role: "test", onPass: "review", onFail: "build-ui" },
    { id: "review", kind: "agent", label: "Claude reviews", agent: "claude", role: "review", onPass: "commit", onFail: "build-ui" },
    { id: "commit", kind: "commit", label: "Commit to run branch" },
  ],
};

/** Stages whose outcome is a judgement and may send the run back. */
export function stageCanFail(stage: PipelineStage): boolean {
  return stage.kind !== "context" && stage.kind !== "commit";
}

/** Returns a list of human-readable problems; an empty list means valid. */
export function validatePipeline(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object") return ["Pipeline must be a JSON object."];
  const def = value as Partial<PipelineDefinition>;
  if (typeof def.id !== "string" || !ID_PATTERN.test(def.id)) errors.push("Pipeline id must be 1-40 lowercase letters, digits or dashes.");
  if (typeof def.name !== "string" || !def.name.trim()) errors.push("Pipeline name is required.");
  if (!Number.isInteger(def.maxRounds) || (def.maxRounds as number) < 1 || (def.maxRounds as number) > 10) {
    errors.push("maxRounds must be an integer from 1 to 10.");
  }
  if (!Array.isArray(def.stages) || def.stages.length === 0) {
    errors.push("A pipeline needs at least one stage.");
    return errors;
  }
  const index = new Map<string, number>();
  def.stages.forEach((stage, i) => {
    const where = `Stage ${i + 1}`;
    if (!stage || typeof stage !== "object") { errors.push(`${where} must be an object.`); return; }
    if (typeof stage.id !== "string" || !ID_PATTERN.test(stage.id)) errors.push(`${where}: id must be 1-40 lowercase letters, digits or dashes.`);
    else if (index.has(stage.id)) errors.push(`${where}: duplicate id "${stage.id}".`);
    else index.set(stage.id, i);
    if (!KINDS.includes(stage.kind)) { errors.push(`${where}: unknown kind "${String(stage.kind)}".`); return; }
    if (stage.kind === "agent" || stage.kind === "gate") {
      if (!stage.agent || !AGENT_IDS.includes(stage.agent)) errors.push(`${where}: agent must be one of ${AGENT_IDS.join(", ")}.`);
      if (!stage.role || !ROLES.includes(stage.role)) errors.push(`${where}: role must be one of ${ROLES.join(", ")}.`);
    }
    if (stage.role === "implement" && stage.agent && LOCAL_MODEL_AGENTS.includes(stage.agent)) {
      errors.push(`${where}: ${stage.agent} answers through a local HTTP API and cannot edit files, so it cannot implement.`);
    }
    if (stage.kind === "gate" && stage.role && stage.role !== "test" && stage.role !== "review") {
      errors.push(`${where}: a gate's agent role must be test or review.`);
    }
    if (stage.kind === "command" || stage.kind === "gate") {
      if (!stage.command || !COMMANDS.includes(stage.command)) errors.push(`${where}: command must be build or test.`);
    }
    if (stage.sources !== undefined && (!Array.isArray(stage.sources) || stage.sources.some((s) => typeof s !== "string"))) {
      errors.push(`${where}: sources must be a list of paths.`);
    }
  });
  def.stages.forEach((stage, i) => {
    if (!stage || typeof stage !== "object") return;
    const where = `Stage "${stage.id}"`;
    for (const key of ["onPass", "onFail"] as const) {
      const target = stage[key];
      if (target === undefined) continue;
      if (!index.has(target)) { errors.push(`${where}: ${key} points to unknown stage "${target}".`); continue; }
      if (key === "onPass" && (index.get(target) as number) <= i) errors.push(`${where}: onPass must point to a later stage.`);
    }
    if (stage.onFail !== undefined && !stageCanFail(stage)) errors.push(`${where}: a ${stage.kind} stage cannot fail, so it cannot have onFail.`);
  });
  const last = def.stages[def.stages.length - 1];
  if (last && last.kind !== "commit" && last.kind !== "human") errors.push("The last stage must be commit or human.");
  return errors;
}

export function assertValidPipeline(value: unknown): PipelineDefinition {
  const errors = validatePipeline(value);
  if (errors.length) throw new Error(`INVALID_PIPELINE: ${errors.join(" ")}`);
  return value as PipelineDefinition;
}

/**
 * Where the run goes after a stage. `null` means the task is finished.
 * A failure without onFail repeats the same stage.
 */
export function nextStageId(def: PipelineDefinition, stageId: string, passed: boolean): string | null {
  const i = def.stages.findIndex((stage) => stage.id === stageId);
  if (i < 0) throw new Error(`UNKNOWN_STAGE: ${stageId}`);
  const stage = def.stages[i];
  if (!passed) return stage.onFail ?? stage.id;
  if (stage.onPass) return stage.onPass;
  return def.stages[i + 1]?.id ?? null;
}
