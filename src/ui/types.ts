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

export interface TimelineEvent {
  id: string;
  type:
    | "CHECKPOINT_REQUESTED"
    | "CHECKPOINT_DECIDED"
    | "DECISION"
    | "STAGE_CHANGE";
  timestamp: string;
  title: string;
  description: string;
  actor?: string;
  badgeVariant: "purple" | "blue" | "green" | "amber" | "rose";
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
  recentActivity?: string;
}

export interface ProjectFileEntry {
  path: string;
  name: string;
  extension: string;
  size: number;
  depth: number;
  language: string;
}

export interface ProjectIndex {
  rootName: string;
  files: ProjectFileEntry[];
  technologies: string[];
  totalFiles: number;
  truncated: boolean;
  ignoredCount: number;
  generatedAt: string;
}

export interface ProjectFile {
  path: string;
  content: string;
  truncated: boolean;
  language: string;
}

export interface FileRelationship {
  source: string;
  target: string;
  kind: "import" | "reference";
}

export interface ProjectFlowNode {
  id: string;
  label: string;
  path: string;
  language: string;
  group: string;
}

export interface ProjectFlow {
  nodes: ProjectFlowNode[];
  edges: FileRelationship[];
  totalFiles: number;
  truncatedNodes: boolean;
  truncatedEdges: boolean;
}

export interface HarnessFlowStep {
  id: string;
  label: string;
  status: "complete" | "current" | "ready" | "unavailable" | "future" | "disabled";
  detail: string;
}

export interface ProviderState {
  id: "codex" | "antigravity" | "ollama";
  name: string;
  status:
    | "available"
    | "authentication_required"
    | "offline"
    | "not_installed";
  detail: string;
  executable?: string;
}

export type OrchestrationMode =
  | "auto"
  | "codex"
  | "antigravity"
  | "ollama"
  | "parallel"
  | "codex_writes_antigravity_reviews"
  | "antigravity_writes_codex_reviews";

export interface HarnessSession {
  id: string;
  workspaceId: string;
  title: string;
  mode: OrchestrationMode;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  messages?: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    provider?: "codex" | "antigravity" | "ollama";
    content: string;
    createdAt: string;
    usage?: Record<string, number>;
    error?: string;
  }>;
  providerConversations?: Partial<Record<"codex" | "antigravity" | "ollama", string>>;
  proposals?: Array<{
    id: string;
    provider: "codex" | "antigravity" | "ollama";
    path: string;
    summary: string;
    original?: string;
    replacement?: string;
    createdAt: string;
  }>;
}
