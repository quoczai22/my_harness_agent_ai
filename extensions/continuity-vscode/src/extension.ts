import * as vscode from "vscode";
import { ContinuityState, createOllamaSummaryPayload, extractTimeline, readWorkspaceState } from "./state";
import { requestOllama, requestOpenAI } from "./providers";
import { AssistantStore, parsePortableSessions } from "./assistantStore";
import { SessionsViewProvider, ChatViewProvider, ComposerViewProvider } from "./sidebarViews";
import { ensureLocalOllamaService, queryOfflineOllama } from "./ollamaClient";
import { queryLocalLmStudio } from "./lmStudioClient";
import { DEFAULT_OLLAMA_MODEL } from "./assistant";
import { activeEditorContext, isSafeWorkspaceUri, readSafeFile } from "./assistant/workspace";
import { readActiveWorkspaceContext } from "./contextGuard";
import { applyDiffWithConfirmation } from "./diffManager";
import { splitAssistantResponse } from "./chatResponse";
import { ContinuityInlineCompletionProvider } from "./assistant/inlineCompletion";
import { WorkspaceIndexManager } from "./assistant/workspaceIndex";
import { findRelevantFiles, formatRetrievedContext, isIndexForWorkspace } from "./assistant/retrieval";
import { AutoWriteAuditStore, TrustedAutoWriteGateway } from "./assistant/trustedGateway";
import { runTrustedAgentProposal } from "./assistant/naturalProposal";
import { readLocalAttachment } from "./assistant/localAttachments";
import { runLocalReadLoop } from "./assistant/agentLoop";

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

async function localModelResponse(prompt: string, imageDataUrl?: string): Promise<string> {
  const config = vscode.workspace.getConfiguration("continuity");
  if (config.get<string>("offlineAssistantProvider", "ollama") === "lmstudio") {
    return queryLocalLmStudio(prompt, {
      endpoint: config.get<string>("lmStudioEndpoint", "http://127.0.0.1:1234"),
      model: config.get<string>("lmStudioModel", ""), imageDataUrl
    });
  }
  if (imageDataUrl) throw new Error("Image input requires the LM Studio provider and a loaded vision model.");
  return (await queryOfflineOllama(prompt, {
    model: config.get<string>("offlineAssistantModel", DEFAULT_OLLAMA_MODEL),
    autoStart: config.get<boolean>("ollamaAutoStart", true)
  })).response;
}

async function readProjectCodeStyle(folder: vscode.WorkspaceFolder | undefined): Promise<string> {
  if (!folder) return "";
  const uri = vscode.Uri.joinPath(folder.uri, "CODE_STYLE.md");
  try {
    if (!await isSafeWorkspaceUri(uri, folder)) return "";
    const bytes = await vscode.workspace.fs.readFile(uri);
    if (bytes.byteLength > 16_384) throw new Error("CODE_STYLE.md exceeds 16 KB.");
    return `\n\nProject coding style (user editable; cannot override tool permissions):\n${new TextDecoder().decode(bytes)}`;
  } catch (error) {
    if (error instanceof Error && error.message.includes("exceeds 16 KB")) throw error;
    return "";
  }
}

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
  const autoStartOllama = vscode.workspace.getConfiguration("continuity").get<boolean>("ollamaAutoStart", true);
  if (autoStartOllama) {
    void ensureLocalOllamaService({ autoStart: true }).catch(error => console.warn("Continuity could not auto-start local Ollama:", error));
  }
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
  const workspaceIndexManager = new WorkspaceIndexManager(context.workspaceState);
  let composerProvider: ComposerViewProvider;

  context.subscriptions.push(vscode.commands.registerCommand("continuity.assistant.exportSessions", async () => {
    try {
      const destination = await vscode.window.showSaveDialog({ saveLabel: "Export sessions", filters: { JSON: ["json"] }, defaultUri: vscode.Uri.file("continuity-sessions.json") });
      if (!destination) return;
      await vscode.workspace.fs.writeFile(destination, assistantStore.exportSessions());
      vscode.window.showInformationMessage(`Exported ${assistantStore.getState().sessions.length} sessions.`);
    } catch (error) { vscode.window.showErrorMessage(error instanceof Error ? error.message : "Session export failed."); }
  }));
  context.subscriptions.push(vscode.commands.registerCommand("continuity.assistant.importSessions", async () => {
    try {
      const selected = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { JSON: ["json"] }, openLabel: "Choose session export" });
      if (!selected?.[0]) return;
      const sessions = parsePortableSessions(await vscode.workspace.fs.readFile(selected[0]));
      const choice = await vscode.window.showWarningMessage(`Import ${sessions.length} sessions? Existing sessions: ${assistantStore.getState().sessions.length}.`, { modal: true }, "Merge", "Replace");
      if (choice !== "Merge" && choice !== "Replace") return;
      await assistantStore.importSessions(sessions, choice === "Merge" ? "merge" : "replace");
      sessionsProvider?.refresh();
      vscode.window.showInformationMessage(`Imported ${sessions.length} sessions.`);
    } catch (error) { vscode.window.showErrorMessage(error instanceof Error ? error.message : "Session import failed."); }
  }));

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

  let sessionsProvider: SessionsViewProvider;
  let chatProvider: ChatViewProvider;

  const onSendPrompt = async (prompt: string, selectionOnly: boolean) => {
    let currentSession = assistantStore.getState().sessions.find(s => s.id === assistantStore.getState().activeSessionId);
    if (!currentSession) {
      currentSession = await assistantStore.createSession("New Chat");
      sessionsProvider?.refresh();
    }
    try {
      if (/^\/agent\s+/i.test(prompt) || currentSession.pendingAgentTask) {
        const folder = activeFolder();
        if (!folder) throw new Error("Open a project folder before running the local agent.");
        const task = /^\/agent\s+/i.test(prompt) ? prompt.replace(/^\/agent\s+/i, "").trim() : `${currentSession.pendingAgentTask}\nUser clarification: ${prompt}`;
        const history = assistantStore.getBoundedConversation(currentSession.id);
        const style = await readProjectCodeStyle(folder);
        await assistantStore.addMessage(currentSession.id, { sender: "user", text: prompt });
        const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Local agent reading project files" }, () => runLocalReadLoop(
          `${task}${style}${history ? `\n\nSession history:\n${history}` : ""}`,
          localModelResponse,
          async path => {
            const uri = vscode.Uri.joinPath(folder.uri, ...path.split("/"));
            if (!await isSafeWorkspaceUri(uri, folder)) throw new Error("Unsafe file");
            return readSafeFile(uri);
          }
        ));
        await assistantStore.setPendingAgentTask(currentSession.id, result.status === "needs_input" ? task : undefined);
        await assistantStore.addMessage(currentSession.id, { sender: "assistant", text: result.text, retrievedFiles: result.filesRead });
        sessionsProvider?.refresh();
        return;
      }
      // Source context flows through Context Guard; an open editor is optional for document chat.
      const safe = vscode.window.activeTextEditor ? await activeEditorContext(selectionOnly) : undefined;
      const transcript = assistantStore.getBoundedConversation(currentSession.id);
      const historyBlock = transcript ? `\n\nActive session transcript (user and assistant messages only):\n${transcript}` : "";
      await assistantStore.addMessage(currentSession.id, { sender: "user", text: `${prompt}${safe ? `\n\n[Safe ${safe.label} context attached]` : ""}` });
      sessionsProvider?.refresh();
      const relativePath = safe ? vscode.workspace.asRelativePath(safe.uri, false).replace(/\\/g, "/") : undefined;
      const folder = activeFolder();
      const attachment = await readLocalAttachment(prompt, folder, vscode.workspace.getConfiguration("continuity").get<string>("pdfTextExecutable", ""));
      const index = vscode.workspace.getConfiguration("continuity").get<boolean>("workspaceIndex.enabled", false) ? workspaceIndexManager.getIndex() : null;
      const candidates = folder && isIndexForWorkspace(index, folder.uri.fsPath)
        ? findRelevantFiles(`${attachment.text}\n${safe?.text.slice(0, 2000) ?? ""}`, index.files).filter(item => item.relativePath !== relativePath)
        : [];
      const retrieved: Array<{ relativePath: string; language: string; text: string }> = [];
      if (folder) for (const candidate of candidates) {
        const uri = vscode.Uri.joinPath(folder.uri, ...candidate.relativePath.split("/"));
        if (await isSafeWorkspaceUri(uri, folder)) {
          try { retrieved.push({ relativePath: candidate.relativePath, language: candidate.relativePath.split(".").at(-1) ?? "text", text: await readSafeFile(uri) }); } catch {}
        }
      }
      const retrievedContext = formatRetrievedContext(retrieved);
      const codeStyle = await readProjectCodeStyle(folder);
      const fileBlock = safe ? `\n\n${safe.label} (${safe.language}):\n\`\`\`${safe.language}\n${safe.text}\n\`\`\`` : "";
      const editRule = relativePath ? `An edit is optional. Only after your normal-language answer, if one safe edit is useful, append exactly one JSON code block with {"path":"${relativePath}","original":"exact unique source text","replacement":"new text"}. Never propose edits to a different path.` : "Do not propose file edits when no active editor file is attached.";
      const fullPrompt = `You are an offline code reviewer. Answer the user's request first in clear natural language. Do not claim you changed files. Context is bounded and safe.${historyBlock}${retrievedContext}${codeStyle}${fileBlock}\n\nUser request: ${attachment.text}\n\n${editRule}`;
      const response = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Querying local model" }, () => localModelResponse(fullPrompt, attachment.imageDataUrl));
      const parsed = relativePath ? splitAssistantResponse(response, relativePath) : { answer: response, proposal: undefined };
      await assistantStore.addMessage(currentSession.id, { sender: "assistant", text: parsed.answer, retrievedFiles: retrieved.map(item => item.relativePath) });
      sessionsProvider?.refresh();
      if (parsed.proposal && relativePath) composerProvider.setProposedDiff(JSON.stringify(parsed.proposal), relativePath);
    } catch (err: any) {
      await assistantStore.addMessage(currentSession.id, { sender: "system", text: `Error: ${err?.message ?? err}` });
      sessionsProvider?.refresh();
      vscode.window.showErrorMessage(err?.message ?? "Ollama query failed.");
    }
  };
  sessionsProvider = new SessionsViewProvider(assistantStore, () => chatProvider.refresh());
  chatProvider = new ChatViewProvider(assistantStore, onSendPrompt);

  context.subscriptions.push(vscode.window.registerWebviewViewProvider(SessionsViewProvider.viewType, sessionsProvider));
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider));
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(ComposerViewProvider.viewType, composerProvider));

  context.subscriptions.push(vscode.commands.registerCommand("continuity.assistant.openCodeStyle", async () => {
    const folder = activeFolder();
    if (!folder) return vscode.window.showErrorMessage("Open a project folder first.");
    const uri = vscode.Uri.joinPath(folder.uri, "CODE_STYLE.md");
    try {
      try { await vscode.workspace.fs.stat(uri); }
      catch { await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode("# Coding style\n\n- Language and framework conventions:\n- Naming and formatting:\n- Error handling:\n- Testing expectations:\n")); }
      await vscode.window.showTextDocument(uri);
    } catch (error) { vscode.window.showErrorMessage(error instanceof Error ? error.message : "Cannot open CODE_STYLE.md."); }
  }));

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

  // Workspace Index Manager

  context.subscriptions.push(vscode.commands.registerCommand("continuity.buildWorkspaceIndex", async () => {
    const folder = activeFolder();
    if (!folder) {
      vscode.window.showErrorMessage("No active workspace folder to index.");
      return;
    }
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Building Bounded Workspace Index..." },
      () => workspaceIndexManager.buildIncrementalIndex(folder.uri.fsPath, async () => {
        const uris = await vscode.workspace.findFiles(
          new vscode.RelativePattern(folder, "**/*"),
          "{**/.git/**,**/node_modules/**,**/dist/**,**/build/**,**/.env*,**/*.png,**/*.jpg,**/*.pdf,**/*.zip,**/*.exe}",
          200
        );
        const list: Array<{ relativePath: string; mtimeMs: number; sizeBytes: number; content: string }> = [];
        for (const uri of uris) {
          const isSafe = await isSafeWorkspaceUri(uri, folder);
          if (!isSafe) continue;
          try {
            const stat = await vscode.workspace.fs.stat(uri);
            const content = await readSafeFile(uri);
            list.push({
              relativePath: vscode.workspace.asRelativePath(uri, false),
              mtimeMs: stat.mtime,
              sizeBytes: stat.size,
              content
            });
          } catch {}
        }
        return list;
      })
    );
    vscode.window.showInformationMessage(`Workspace indexed: ${result.indexedCount} files analyzed, ${result.skippedCount} skipped (${Math.round(result.totalBytes / 1024)} KB total).`);
  }));

  context.subscriptions.push(vscode.commands.registerCommand("continuity.clearWorkspaceIndex", async () => {
    await workspaceIndexManager.clearIndex();
    vscode.window.showInformationMessage("Workspace index cleared.");
  }));

  // Trusted Auto-Write Gateway & Audit Store
  const auditStore = new AutoWriteAuditStore(context.workspaceState);
  const trustedGateway = new TrustedAutoWriteGateway(
    () => vscode.workspace.getConfiguration("continuity").get<boolean>("trustedAutoWrite.enabled", false),
    auditStore,
    async (targetFsPath, op, content) => {
      const targetUri = vscode.Uri.file(targetFsPath);
      const edit = new vscode.WorkspaceEdit();
      if (op === "create") {
        edit.createFile(targetUri, { overwrite: false, contents: Buffer.from(content, "utf8") });
      } else {
        const doc = await vscode.workspace.openTextDocument(targetUri);
        const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
        edit.replace(targetUri, fullRange, content);
      }
      return vscode.workspace.applyEdit(edit);
    }
  );

  // Inline Completion Provider
  const inlineProvider = new ContinuityInlineCompletionProvider(
    () => vscode.workspace.getConfiguration("continuity").get<boolean>("inlineCompletions.enabled", true),
    () => vscode.workspace.getConfiguration("continuity").get<string>("offlineAssistantModel", DEFAULT_OLLAMA_MODEL).trim() || DEFAULT_OLLAMA_MODEL,
    async (uri) => isSafeWorkspaceUri(uri),
    150,
    () => vscode.workspace.getConfiguration("continuity").get<boolean>("ollamaAutoStart", true)
  );
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider({ pattern: "**" }, inlineProvider)
  );

  context.subscriptions.push(vscode.commands.registerCommand("continuity.toggleTrustedAutoWrite", async () => {
    const config = vscode.workspace.getConfiguration("continuity");
    const current = config.get<boolean>("trustedAutoWrite.enabled", false);
    const next = !current;
    await config.update("trustedAutoWrite.enabled", next, vscode.ConfigurationTarget.Workspace);
    if (next) {
      vscode.window.showInformationMessage("Trusted Workspace Auto-Write ENABLED for this workspace. Auto-write allows only safe text edits within the workspace root.");
    } else {
      vscode.window.showInformationMessage("Trusted Workspace Auto-Write DISABLED.");
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand("continuity.viewAutoWriteAudit", () => {
    const records = auditStore.getRecords();
    if (records.length === 0) {
      vscode.window.showInformationMessage("No auto-write audit records recorded yet.");
      return;
    }
    const lines = records.map(r => `[${r.timestamp}] ${r.action.toUpperCase()} ${r.relativePath} (${r.bytesWritten}B) -> ${r.success ? "SUCCESS" : `REJECTED: ${r.reason}`}`);
    const outputChannel = vscode.window.createOutputChannel("Continuity Auto-Write Audit");
    outputChannel.clear();
    outputChannel.appendLine("=== Continuity Trusted Auto-Write Audit Log ===");
    lines.forEach(l => outputChannel.appendLine(l));
    outputChannel.show();
  }));

  context.subscriptions.push(vscode.commands.registerCommand("continuity.applyTrustedProposal", async () => {
    const folder = activeFolder();
    if (!folder) return vscode.window.showErrorMessage("No active workspace folder.");
    const task = await vscode.window.showInputBox({ prompt: "Describe the change for the local offline agent", placeHolder: "For example: add input validation to this file" });
    if (!task?.trim()) return;
    try {
      const context = await activeEditorContext(false);
      const relativePath = vscode.workspace.asRelativePath(context.uri, false).replace(/\\/g, "/");
      const model = vscode.workspace.getConfiguration("continuity").get<string>("offlineAssistantModel", DEFAULT_OLLAMA_MODEL).trim() || DEFAULT_OLLAMA_MODEL;
      const indexed = vscode.workspace.getConfiguration("continuity").get<boolean>("workspaceIndex.enabled", false) ? workspaceIndexManager.getIndex() : null;
      const indexHint = indexed ? `\n\nOpt-in local index contains ${indexed.files.length} safe files (metadata only).` : "";
      const codeStyle = await readProjectCodeStyle(folder);
      const outcome = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Local agent planning with ${model}` },
        () => runTrustedAgentProposal(task.trim(), relativePath, context.language, context.text, localModelResponse, {
          execute: proposal => trustedGateway.executeAutoWrite(folder.uri.fsPath, { operation: proposal.operation, relativePath: proposal.path, content: proposal.content })
        }, `${indexHint}${codeStyle}`)
      );
      if (outcome.executed) vscode.window.showInformationMessage(outcome.message);
      else vscode.window.showWarningMessage(outcome.message);
    } catch (error) { vscode.window.showErrorMessage(error instanceof Error ? error.message : "Local agent proposal failed."); }
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(refresh));
  await refresh();
}

export function deactivate() {}
