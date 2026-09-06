import * as vscode from "vscode";
import { ContinuityState, createOllamaSummaryPayload, extractTimeline, readWorkspaceState } from "./state";
import { requestOllama, requestOpenAI } from "./providers";
import { AssistantStore } from "./assistantStore";
import { SessionsViewProvider, ChatViewProvider, ComposerViewProvider } from "./sidebarViews";
import { queryOfflineOllama } from "./ollamaClient";
import { DEFAULT_OLLAMA_MODEL } from "./assistant";
import { activeEditorContext } from "./assistant/workspace";
import { readActiveWorkspaceContext } from "./contextGuard";
import { applyDiffWithConfirmation } from "./diffManager";
import { splitAssistantResponse } from "./chatResponse";

const OPENAI_KEY_SECRET = "continuity.openaiApiKey";
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

async function requestOllamaSummary(state: ContinuityState | undefined, secrets: vscode.SecretStorage): Promise<string> {
  const provider = vscode.workspace.getConfiguration("continuity").get<string>("summaryProvider", "ollama");
  if (provider === "openai") {
    const confirmed = await vscode.window.showWarningMessage("This sends a bounded workflow summary to OpenAI. Continue?", { modal: true }, "Continue");
    if (confirmed !== "Continue") throw new Error("OpenAI request cancelled.");
    const key = await secrets.get(OPENAI_KEY_SECRET);
    if (!key) throw new Error("Set an OpenAI API key first.");
    return requestOpenAI(state, vscode.workspace.getConfiguration("continuity").get<string>("openaiModel", "gpt-6-astra"), key);
  }
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
  context.subscriptions.push(vscode.window.registerTreeDataProvider("continuity.workflow", provider));  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = "continuity.refresh";
  context.subscriptions.push(status);

  const refresh = async () => { cachedState = await readWorkspaceState(activeFolder()); provider.refresh(); status.text = `$(git-commit) Continuity: ${cachedState?.stage ?? "Unavailable"}`; status.show(); };
  context.subscriptions.push(vscode.commands.registerCommand("continuity.refresh", refresh));
  context.subscriptions.push(vscode.commands.registerCommand("continuity.openTimeline", () => { const panel = vscode.window.createWebviewPanel("continuity.timeline", "Continuity Timeline", vscode.ViewColumn.Beside, { enableScripts: false }); panel.webview.html = renderTimeline(cachedState); }));
  context.subscriptions.push(vscode.commands.registerCommand("continuity.summarizeWithOllama", async () => {
    try { const summary = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Asking local Ollama" }, () => requestOllamaSummary(cachedState, context.secrets)); vscode.window.showInformationMessage(summary); }
    catch (error) { vscode.window.showErrorMessage(error instanceof Error ? error.message : "Local Ollama is unavailable."); }
  }));

  // Offline Code Assistant Initialization
  const assistantStore = new AssistantStore(context.workspaceState);
  let composerProvider: ComposerViewProvider;

  const onApplyDiff = async (diff: string, targetFile: string) => {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      vscode.window.showErrorMessage("No active editor to apply diff to.");
      return;
    }
    const confirmed = await vscode.window.showWarningMessage(
      `Apply proposed diff to ${targetFile || activeEditor.document.fileName}?`,
      { modal: true },
      "Apply Diff"
    );
    if (confirmed === "Apply Diff") {
      const result = await applyDiffWithConfirmation(activeEditor.document.uri, diff, true);
      if (result.applied) {
        vscode.window.showInformationMessage(result.message);
      } else {
        vscode.window.showErrorMessage(result.message);
      }
    }
  };

  composerProvider = new ComposerViewProvider(onApplyDiff);

  const onSendPrompt = async (prompt: string, selectionOnly: boolean) => {
    let currentSession = assistantStore.getState().sessions.find(s => s.id === assistantStore.getState().activeSessionId);
    if (!currentSession) currentSession = await assistantStore.createSession("New Chat");
    try {
      // All source context flows through Context Guard; it enforces containment and bounded reads.
      const safe = await activeEditorContext(selectionOnly);
      await assistantStore.addMessage(currentSession.id, { sender: "user", text: `${prompt}\n\n[Safe ${safe.label} context attached]` });
      const relativePath = vscode.workspace.asRelativePath(safe.uri, false).replace(/\\/g, "/");
      const model = vscode.workspace.getConfiguration("continuity").get<string>("offlineAssistantModel", DEFAULT_OLLAMA_MODEL).trim() || DEFAULT_OLLAMA_MODEL;
      const fullPrompt = `You are an offline code reviewer. Answer the user's request first in clear natural language. Do not claim you changed files. Context is bounded and safe.\n\n${safe.label} (${safe.language}):\n\`\`\`${safe.language}\n${safe.text}\n\`\`\`\n\nUser request: ${prompt}\n\nAn edit is optional. Only after your normal-language answer, if one safe edit is useful, append exactly one JSON code block with {"path":"${relativePath}","original":"exact unique source text","replacement":"new text"}. Never propose edits to a different path.`;
      const response = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Querying local Ollama (${model})` }, () => queryOfflineOllama(fullPrompt, { model }));
      const parsed = splitAssistantResponse(response.response, relativePath);
      await assistantStore.addMessage(currentSession.id, { sender: "assistant", text: parsed.answer });
      if (parsed.proposal) composerProvider.setProposedDiff(JSON.stringify(parsed.proposal), relativePath);
    } catch (err: any) {
      await assistantStore.addMessage(currentSession.id, { sender: "system", text: `Error: ${err?.message ?? err}` });
      vscode.window.showErrorMessage(err?.message ?? "Ollama query failed.");
    }
  };
  const sessionsProvider = new SessionsViewProvider(assistantStore);
  const chatProvider = new ChatViewProvider(assistantStore, onSendPrompt);

  context.subscriptions.push(vscode.window.registerWebviewViewProvider(SessionsViewProvider.viewType, sessionsProvider));
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider));
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(ComposerViewProvider.viewType, composerProvider));

  context.subscriptions.push(vscode.commands.registerCommand("continuity.assistant.rebuildStyleProfile", async () => {
    const contextData = await readActiveWorkspaceContext(activeFolder());
    const profile = await assistantStore.rebuildStyleProfile(contextData.files);
    vscode.window.showInformationMessage(`Style Profile Rebuilt: ${profile.indentation}, ${profile.quotes} quotes, semi:${profile.semicolons} (from ${profile.extractedFromFilesCount} files).`);
    chatProvider.refresh();
  }));

  context.subscriptions.push(vscode.commands.registerCommand("continuity.assistant.clearSessions", async () => {
    await assistantStore.clearAllSessions();
    sessionsProvider.refresh();
    chatProvider.refresh();
    vscode.window.showInformationMessage("All assistant sessions cleared.");
  }));

  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(refresh));
  await refresh();
}

export function deactivate() {}
