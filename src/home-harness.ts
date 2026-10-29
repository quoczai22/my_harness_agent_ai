export type LaneStatus = "QUEUED" | "RUNNING" | "WAITING_APPROVAL" | "DONE" | "FAILED";
export type HarnessAction = "summarize" | "run_tests" | "cloud_request" | "checkpoint" | "commit" | "push";
export interface Lane { id: string; title: string; status: LaneStatus; provider: "ollama" | "localai" | "openai"; }
export interface PolicyDecision { action: HarnessAction; allowed: boolean; requiresApproval: boolean; reason: string; }

const APPROVAL_REQUIRED = new Set<HarnessAction>(["cloud_request", "checkpoint", "commit", "push"]);
export function evaluateHarnessPolicy(action: HarnessAction): PolicyDecision {
  const requiresApproval = APPROVAL_REQUIRED.has(action);
  return { action, allowed: !requiresApproval, requiresApproval, reason: requiresApproval ? "Human approval is required." : "Read-only or local automatic action." };
}
export function defaultLanes(): Lane[] {
  return [{ id: "local-summary", title: "Local workflow summary", status: "QUEUED", provider: "ollama" }];
}
export function localProviderUrl(provider: "ollama" | "localai"): string {
  return provider === "ollama" ? "http://127.0.0.1:11434" : "http://127.0.0.1:8080";
}
