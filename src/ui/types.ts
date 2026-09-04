export interface WorkflowTask {
  id: string;
  description: string;
  keywords: string[];
  changeId?: string;
  status: "pending" | "in_progress" | "done";
  assignedRole?: string;
}

export interface Checkpoint {
  id: string;
  changeId: string;
  type: "spec_review" | "impl_review";
  status: "PENDING" | "APPROVED" | "REJECTED";
  payload: string;
  createdAt: string;
  decidedAt?: string;
  reasoning?: string;
}

export interface Decision {
  timestamp: string;
  actor: string;
  decision: string;
  reasoning: string;
}

export interface WorkflowState {
  projectId: string;
  currentChangeId: string | null;
  stage:
    | "IDLE"
    | "SPEC_READY"
    | "CHECKPOINT_1"
    | "IMPL_IN_PROGRESS"
    | "IMPL_DONE"
    | "CHECKPOINT_2"
    | "DONE";
  tasks: WorkflowTask[];
  checkpoints: Checkpoint[];
  blockers: string[];
  decisions: Decision[];
  lastUpdated?: string;
}

export interface GitSummary {
  branch: string;
  clean: boolean;
  modifiedFiles: string[];
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  path: string;
  port?: number;
  status: "ACTIVE" | "UNAVAILABLE";
  instanceHealth?: "ONLINE" | "OFFLINE" | "UNKNOWN";
  error?: string;
  stage?: string;
  currentChangeId?: string | null;
  tasksCount?: number;
  blockersCount?: number;
  gitClean?: boolean;
}
