import * as vscode from "vscode";
import { ContinuityState, createOllamaSummaryPayload, extractTimeline, readWorkspaceState } from "./state";

const OLLAMA_URL = "http://127.0.0.1:11434/api/generate";

class WorkflowProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  constructor(private readonly state: () => ContinuityState | undefined) {}
  refresh() { this.changed.fire(); }
  getTreeItem(item: vscode.TreeItem) { return item; }
  getChildren(): vscode.TreeItem[] {
    const state = this.state();
    if (!state) return [new vscode.TreeItem("No readable .continuity/state.json", vscode.TreeItemCollapsibleState.None)];
    const items = [
      new vscode.TreeItem(`Stage: ${state.stage ?? "IDLE"}`),
      new vscode.TreeItem(`Change: ${state.currentChangeId ?? "None"}`),
      new vscode.TreeItem(`Tasks: ${state.tasks?.length ?? 0}`),
      new vscode.TreeItem(`Blockers: ${state.blockers?.length ?? 0}`),
      new vscode.TreeItem(`Checkpoints: ${state.checkpoints?.length ?? 0}`)
    ];
    items[0].iconPath = new vscode.ThemeIcon("git-commit");
    return items;
  }
}

function activeFolder() { return vscode.workspace.workspaceFolders?.[0]; }

function renderTimeline(state: ContinuityState | undefined): string {
  const events = extractTimeline(state).map(event => `<article><time>${escapeHtml(event.timestamp)}</time><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(event.description)}</p></article>`).join("") || "<p>No timeline events.</p>";
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{font-family:var(--vscode-font-family);padding:16px;color:var(--vscode-foreground)}article{border-left:2px solid var(--vscode-focusBorder);padding:8px 12px;margin:10px 0}time{display:block;color:var(--vscode-descriptionForeground);font-size:.85em}p{white-space:pre-wrap}</style></head><body><h2>Continuity Timeline</h2>${events}</body></html>`;
}

function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" })[character] ?? character); }

async function requestOllamaSummary(state: ContinuityState | undefined): Promise<string> {
  const model = vscode.workspace.getConfiguration("continuity").get<string>("ollamaModel", "").trim();
  if (!model) throw new Error("Set Continuity: Ollama Model before using the local helper.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(OLLAMA_URL, { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify({ model, stream: false, prompt: `Summarize this Continuity workflow snapshot. Do not infer missing information.\n${createOllamaSummaryPayload(state)}` }) });
    if (!response.ok) throw new Error(`Ollama returned ${response.status}.`);
    const body = await response.json() as { response?: string };
    return body.response?.trim() || "Ollama returned no summary.";
  } finally { clearTimeout(timeout); }
}

export async function activate(context: vscode.ExtensionContext) {
  let cachedState = await readWorkspaceState(activeFolder());
  const provider = new WorkflowProvider(() => cachedState);
  context.subscriptions.push(vscode.window.registerTreeDataProvider("continuity.workflow", provider));
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = "continuity.refresh";
  context.subscriptions.push(status);

  const refresh = async () => { cachedState = await readWorkspaceState(activeFolder()); provider.refresh(); status.text = `$(git-commit) Continuity: ${cachedState?.stage ?? "Unavailable"}`; status.show(); };
  context.subscriptions.push(vscode.commands.registerCommand("continuity.refresh", refresh));
  context.subscriptions.push(vscode.commands.registerCommand("continuity.openTimeline", () => { const panel = vscode.window.createWebviewPanel("continuity.timeline", "Continuity Timeline", vscode.ViewColumn.Beside, { enableScripts: false }); panel.webview.html = renderTimeline(cachedState); }));
  context.subscriptions.push(vscode.commands.registerCommand("continuity.summarizeWithOllama", async () => {
    try { const summary = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Asking local Ollama" }, () => requestOllamaSummary(cachedState)); vscode.window.showInformationMessage(summary); }
    catch (error) { vscode.window.showErrorMessage(error instanceof Error ? error.message : "Local Ollama is unavailable."); }
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(refresh));
  await refresh();
}

export function deactivate() {}
