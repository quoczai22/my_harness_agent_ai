export type Stage = "IDLE" | "SPEC_READY" | "CHECKPOINT_1" | "IMPL_IN_PROGRESS" | "IMPL_DONE" | "CHECKPOINT_2" | "DONE";
export type Verdict = "IN_SCOPE" | "OUT_OF_SCOPE" | "FLAGGED";
export type CheckpointType = "spec_review" | "impl_review";
export type CheckpointStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface Task { id: string; changeId: string; description: string; keywords: string[]; status: "pending" | "in_progress" | "done"; assignedRole: "developer"; }
export interface Checkpoint { id: string; changeId: string; type: CheckpointType; status: CheckpointStatus; payload: string; reasoning?: string; createdAt: string; decidedAt?: string; }
export interface ScopeLogEntry { taskId: string; timestamp: string; actionDescription: string; verdict: Verdict; reason: string; proposedBy: string; }
export interface DecisionLogEntry { timestamp: string; actor: string; decision: string; reasoning: string; }
export interface ContextState { projectId: string; currentChangeId: string | null; stage: Stage; blockers: string[]; lastUpdated: string; tasks: Task[]; checkpoints: Checkpoint[]; scopeLog: ScopeLogEntry[]; decisions: DecisionLogEntry[]; }

export const VALID_TRANSITIONS: Record<Stage, Stage[]> = {
  IDLE: ["SPEC_READY"], SPEC_READY: ["CHECKPOINT_1"], CHECKPOINT_1: ["IMPL_IN_PROGRESS", "SPEC_READY"],
  IMPL_IN_PROGRESS: ["IMPL_DONE"], IMPL_DONE: ["CHECKPOINT_2"], CHECKPOINT_2: ["DONE", "IMPL_IN_PROGRESS"], DONE: ["IDLE"]
};
