import * as vscode from "vscode";
import type { ContinuityState } from "./timeline";
export type { ContinuityCheckpoint, ContinuityDecision, ContinuityState, TimelineEvent } from "./timeline";
export { createOllamaSummaryPayload, extractTimeline } from "./timeline";

export async function readWorkspaceState(folder: vscode.WorkspaceFolder | undefined): Promise<ContinuityState | undefined> {
  if (!folder) return undefined;
  const stateUri = vscode.Uri.joinPath(folder.uri, ".continuity", "state.json");
  try {
    const bytes = await vscode.workspace.fs.readFile(stateUri);
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as ContinuityState : undefined;
  } catch {
    return undefined;
  }
}