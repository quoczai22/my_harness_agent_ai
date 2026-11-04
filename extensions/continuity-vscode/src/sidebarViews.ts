import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { AssistantStore, ChatSession } from "./assistantStore";
import { renderNonceProtectedHtml, renderSafeMarkdown } from "./chatResponse";
import type { ProposalCheckResult } from "./assistant/proposalCheck";
import type { RenderedScanPage } from "./assistant/scanPdfVision";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;"
  })[c] ?? c);
}

export interface LocalModelLabel { provider: "ollama" | "lmstudio"; model: string; }

export function localProviderName(provider: LocalModelLabel["provider"]): string {
  return provider === "lmstudio" ? "LM Studio" : "Ollama";
}

export function localQueryFailure(provider: LocalModelLabel["provider"]): string {
  return `${localProviderName(provider)} query failed.`;
}

function assistantLabel(config: LocalModelLabel): string {
  const provider = localProviderName(config.provider);
  return `${provider} (${config.model.trim() || "model not selected"})`;
}

function promptPreview(value: string, maxLength = 160): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

/**
 * Common secure HTML wrapper with strict Content Security Policy.
 */
export function wrapWebviewHtml(title: string, bodyContent: string, vendorCspSource?: string): string {
  const nonce = randomUUID();
  const safeBody = bodyContent.replace(/<script>/g, `<script nonce="${nonce}">`).replace(/<script type="module">/g, `<script type="module" nonce="${nonce}">`);
  const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'${vendorCspSource ? ` ${vendorCspSource}` : ""}; ${vendorCspSource ? `worker-src ${vendorCspSource} blob:; connect-src ${vendorCspSource}; img-src data:;` : ""}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-sideBar-background);
      padding: 12px;
      margin: 0;
    }
    button {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 12px;
      cursor: pointer;
      border-radius: 2px;
      margin-right: 6px;
    }
    button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    .secondary-btn {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .secondary-btn:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }
    .attachment-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
      font-size: 0.9em;
      color: var(--vscode-descriptionForeground);
    }
    .card {
      background-color: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, #333);
      padding: 10px;
      margin-bottom: 10px;
      border-radius: 4px;
    }
    .session-active {
      border: 1px solid var(--vscode-focusBorder, #3794ff);
      border-left: 4px solid var(--vscode-charts-blue, #3794ff);
      background-color: var(--vscode-list-activeSelectionBackground, rgba(55, 148, 255, 0.15));
    }
    .msg-user {
      border-left: 3px solid var(--vscode-charts-blue, #3794ff);
      margin-bottom: 8px;
      padding: 6px 8px;
    }
    .msg-assistant {
      border-left: 3px solid var(--vscode-charts-green, #4ec9b0);
      margin-bottom: 8px;
      padding: 6px 8px;
    }
    .chat-layout {
      display: grid;
      grid-template-columns: 20px minmax(0, 1fr);
      column-gap: 6px;
      margin-bottom: 10px;
    }
    .chat-timeline {
      position: relative;
      height: 280px;
      border-right: 1px solid var(--vscode-widget-border, #444);
    }
    .timeline-marker {
      position: absolute;
      right: -5px;
      width: 8px;
      height: 8px;
      min-width: 8px;
      padding: 0;
      margin: 0;
      border-radius: 50%;
      background: var(--vscode-charts-blue, #3794ff);
      border: 1px solid var(--vscode-sideBar-background);
    }
    .timeline-marker:hover, .timeline-marker:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      background: var(--vscode-button-hoverBackground);
    }
    #messages {
      max-height: 280px;
      overflow-y: auto;
    }
    pre {
      background: var(--vscode-textCodeBlock-background, #1e1e1e);
      padding: 8px;
      overflow-x: auto;
      border-radius: 3px;
    }
    input[type="text"], textarea {
      width: 100%;
      box-sizing: border-box;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      padding: 6px;
      margin-bottom: 8px;
      border-radius: 2px;
    }
  </style>
</head>
<body>
  ${safeBody}
</body>
</html>`;
  return page.replace("script-src 'nonce-'", `script-src 'nonce-${nonce}'`);
}

/**
 * Sidebar Sessions View Provider.
 */
export class SessionsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "continuity.assistant.sessions";
  private _view?: vscode.WebviewView;

  constructor(private readonly store: AssistantStore, private readonly onSessionChanged: () => void = () => {}) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    this.refresh();

    webviewView.webview.onDidReceiveMessage(async message => {
      if (message.command === "newSession") {
        await this.store.createSession("New Chat");
        this.refresh();
        this.onSessionChanged();
      } else if (message.command === "clearAll") {
        await this.store.clearAllSessions();
        this.refresh();
        this.onSessionChanged();
      } else if (message.command === "deleteSession") {
        await this.store.deleteSession(message.sessionId);
        this.refresh();
        this.onSessionChanged();
      } else if (message.command === "selectSession") {
        await this.store.selectSession(message.sessionId);
        this.refresh();
        this.onSessionChanged();
      }
    });
  }

  refresh(): void {
    if (!this._view) return;
    const state = this.store.getState();
    const sessionList = state.sessions.map(s => `
      <div class="card ${s.id === state.activeSessionId ? "session-active" : ""}">
        <button data-select-session="${escapeHtml(s.id)}" class="session-select">${escapeHtml(s.title)} (${s.messages.length} msgs)${s.id === state.activeSessionId ? " — Active" : ""}</button>
        <div style="margin-top: 6px;">
          <button data-delete-session="${escapeHtml(s.id)}" class="secondary-btn btn-delete">Delete</button>
        </div>
      </div>
    `).join("") || "<p style='color: var(--vscode-descriptionForeground);'>No active sessions.</p>";

    const html = `
      <div style="margin-bottom: 12px;">
        <button id="btnNewSession">+ New Session</button>
        <button id="btnClearAll" class="secondary-btn">Clear All</button>
      </div>
      <h3>Sessions</h3>
      ${sessionList}
      <script>
        const vscode = acquireVsCodeApi();
        document.getElementById('btnNewSession')?.addEventListener('click', () => vscode.postMessage({ command: 'newSession' }));
        document.getElementById('btnClearAll')?.addEventListener('click', () => vscode.postMessage({ command: 'clearAll' }));
        document.querySelectorAll('[data-select-session]').forEach(btn => {
          btn.addEventListener('click', () => {
            const sessionId = btn.getAttribute('data-select-session');
            if (sessionId) vscode.postMessage({ command: 'selectSession', sessionId });
          });
        });
        document.querySelectorAll('[data-delete-session]').forEach(btn => {
          btn.addEventListener('click', () => {
            const sessionId = btn.getAttribute('data-delete-session');
            if (sessionId) vscode.postMessage({ command: 'deleteSession', sessionId });
          });
        });
      </script>
    `;

    this._view.webview.html = wrapWebviewHtml("Sessions", html);
  }
}

/**
 * Sidebar Chat View Provider.
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "continuity.assistant.chat";
  private _view?: vscode.WebviewView;
  /** File chosen with the Attach button; sent with the next prompt, then cleared. */
  private attachment?: string;
  private scanAssets?: { moduleUri: string; workerUri: string; cmapUri: string; cspSource: string };
  private pendingRenders = new Map<string, { page: number; resolve: (image: RenderedScanPage) => void; reject: (error: Error) => void }>();
  private pendingReview?: { id: string; draft: string; resolve: (text: string | undefined) => void };

  constructor(
    private readonly store: AssistantStore,
    private readonly onSendPrompt: (prompt: string, selectionOnly: boolean, attachmentPath?: string) => Promise<void>,
    // Injected so this module keeps no runtime dependency on the vscode API (its tests run in plain Node).
    private readonly pickAttachment: () => Promise<string | undefined> = async () => undefined,
    private readonly currentModel: () => LocalModelLabel = () => ({ provider: "ollama", model: "" }),
    private readonly getScanAssets?: (webview: vscode.Webview) => { vendorRoot: vscode.Uri; moduleUri: string; workerUri: string; cmapUri: string; cspSource: string }
  ) {}

  async renderPdfPage(bytes: Uint8Array, page: number, signal: AbortSignal): Promise<RenderedScanPage> {
    if (!this._view || !this.scanAssets) throw new Error("Mở khung chat để vẽ trang PDF.");
    const id = randomUUID();
    return new Promise<RenderedScanPage>((resolve, reject) => {
      const abort = () => {
        this._view?.webview.postMessage({ command: "cancelPdfRender", id });
        this.pendingRenders.delete(id);
        reject(new Error("Đã hủy vẽ trang PDF."));
      };
      if (signal.aborted) { abort(); return; }
      this.pendingRenders.set(id, { page, resolve: image => { signal.removeEventListener("abort", abort); resolve(image); }, reject: error => { signal.removeEventListener("abort", abort); reject(error); } });
      signal.addEventListener("abort", abort, { once: true });
      void this._view!.webview.postMessage({ command: "renderPdfPage", id, page, pdfBase64: Buffer.from(bytes).toString("base64") }).then(sent => {
        if (!sent) { this.pendingRenders.delete(id); signal.removeEventListener("abort", abort); reject(new Error("Không gửi được trang PDF tới webview.")); }
      });
    });
  }

  reviewScanTranscript(draft: string, signal?: AbortSignal): Promise<string | undefined> {
    if (!this._view) return Promise.reject(new Error("Mở khung chat để xác nhận bản chép PDF."));
    if (this.pendingReview) return Promise.reject(new Error("Một bản chép khác đang chờ xác nhận."));
    return new Promise(resolve => {
      const finish = (text: string | undefined) => { signal?.removeEventListener("abort", abort); resolve(text); };
      const abort = () => {
        if (!this.pendingReview) return;
        this.pendingReview = undefined;
        this.refresh();
        finish(undefined);
      };
      if (signal?.aborted) { resolve(undefined); return; }
      signal?.addEventListener("abort", abort, { once: true });
      this.pendingReview = { id: randomUUID(), draft, resolve: finish };
      this.refresh();
    });
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;
    const assets = this.getScanAssets?.(webviewView.webview);
    this.scanAssets = assets;
    webviewView.webview.options = { enableScripts: true, ...(assets ? { localResourceRoots: [assets.vendorRoot] } : {}) };
    this.refresh();

    webviewView.webview.onDidReceiveMessage(async message => {
      if (message.command === "attach") {
        const picked = await this.pickAttachment();
        if (picked) { this.attachment = picked; this.refresh(); }
      } else if (message.command === "removeAttachment") {
        this.attachment = undefined;
        this.refresh();
      } else if (message.command === "send") {
        const attachment = this.attachment;
        this.attachment = undefined;
        await this.onSendPrompt(message.text, message.selectionOnly, attachment);
        this.refresh();
      } else if (message.command === "renderedPdfPage" || message.command === "pdfRenderError") {
        const pending = this.pendingRenders.get(message.id);
        if (!pending) return;
        this.pendingRenders.delete(message.id);
        if (message.command === "pdfRenderError") pending.reject(new Error(String(message.error).slice(0, 300)));
        else if (message.page !== pending.page) pending.reject(new Error("Webview trả ảnh sai số trang PDF."));
        else pending.resolve({ dataUrl: message.dataUrl, width: message.width, height: message.height });
      } else if (message.command === "confirmScanReview" || message.command === "cancelScanReview") {
        if (!this.pendingReview || message.id !== this.pendingReview.id) return;
        const pending = this.pendingReview;
        this.pendingReview = undefined;
        pending.resolve(message.command === "confirmScanReview" ? String(message.text) : undefined);
        this.refresh();
      }
    });
  }

  refresh(): void {
    if (!this._view) return;
    const state = this.store.getState();
    const active = state.sessions.find(s => s.id === state.activeSessionId);
    const profile = state.styleProfile;
    const modelLabel = assistantLabel(this.currentModel());

    const profileBadge = profile
      ? `<div style="font-size: 0.85em; margin-bottom: 8px; color: var(--vscode-descriptionForeground);">
          Style: ${profile.indentation}, ${profile.quotes}-quotes, semi:${profile.semicolons}
        </div>`
      : `<div style="font-size: 0.85em; margin-bottom: 8px; color: var(--vscode-descriptionForeground);">
          No style profile active.
        </div>`;

    const messages = active?.messages ?? [];
    const userMessages = messages.filter(message => message.sender === "user");
    const msgs = messages.map(m => `
      <div id="message-${escapeHtml(m.id)}" class="${m.sender === 'user' ? 'msg-user' : 'msg-assistant'}" data-message-id="${escapeHtml(m.id)}">
        <strong>${m.sender === 'user' ? 'You' : m.sender === 'system' ? 'System' : escapeHtml(modelLabel)}:</strong>
        <div>${renderSafeMarkdown(m.text)}</div>
        ${m.retrievedFiles?.length ? `<div style="margin-top:6px;font-size:.85em;color:var(--vscode-descriptionForeground)">Local context: ${m.retrievedFiles.map(escapeHtml).join(", ")}</div>` : ""}
      </div>
    `).join("") || "<p style='color: var(--vscode-descriptionForeground);'>Start a conversation or ask for a code review.</p>";
    const markers = userMessages.map((message, index) => {
      const preview = promptPreview(message.text);
      const position = Math.round(((index + 1) / (userMessages.length + 1)) * 100);
      return `<button class="timeline-marker" type="button" style="top: ${position}%" data-jump-target="message-${escapeHtml(message.id)}" title="${escapeHtml(preview)}" aria-label="Jump to prompt: ${escapeHtml(preview)}"></button>`;
    }).join("");
    const latestMessageId = messages.at(-1)?.id ?? "";

    const html = `
      ${profileBadge}
      <div class="chat-layout">
        <nav class="chat-timeline" aria-label="User prompt timeline">
          ${markers}
        </nav>
        <div id="messages">
          ${msgs}
        </div>
      </div>
      ${this.attachment ? `<div class="attachment-chip">Attached: ${escapeHtml(basename(this.attachment))} <button id="btnRemoveAttachment" class="secondary-btn" type="button" aria-label="Remove attachment">Remove</button></div>` : ""}
      ${this.pendingReview ? `<div class="scan-review"><h3>Kiểm tra bản chép PDF</h3><textarea id="scanReviewText" rows="12" maxlength="40000">${escapeHtml(this.pendingReview.draft)}</textarea><div><button id="btnConfirmScan">Xác nhận</button><button id="btnCancelScan" class="secondary-btn">Hủy</button></div></div>` : ""}
      <textarea id="promptInput" rows="3" placeholder="Ask ${escapeHtml(modelLabel)}, attach a PDF/image, or review selection..."></textarea>
      <div>
        <button id="btnSend">Send File/Prompt</button>
        <button id="btnAttach" class="secondary-btn" type="button">Attach PDF/Image</button>
        <button id="btnReviewSelection" class="secondary-btn">Review Selection</button>
      </div>
      <script>
        const vscode = acquireVsCodeApi();
        window.continuityVscodeBridge = vscode;
        const messages = document.getElementById('messages');
        const latestMessageId = ${JSON.stringify(latestMessageId)};
        const priorState = vscode.getState() || {};
        requestAnimationFrame(() => {
          if (!messages) return;
          if (priorState.latestMessageId !== latestMessageId) {
            messages.scrollTop = messages.scrollHeight;
          } else if (typeof priorState.scrollTop === 'number') {
            messages.scrollTop = Math.min(priorState.scrollTop, Math.max(0, messages.scrollHeight - messages.clientHeight));
          }
          vscode.setState({ ...(vscode.getState() || {}), latestMessageId, scrollTop: messages.scrollTop });
        });
        messages?.addEventListener('scroll', () => {
          const state = vscode.getState() || {};
          vscode.setState({ ...state, latestMessageId, scrollTop: messages.scrollTop });
        });
        document.querySelectorAll('[data-jump-target]').forEach(marker => {
          marker.addEventListener('click', () => {
            const targetId = marker.getAttribute('data-jump-target');
            document.getElementById(targetId || '')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        });
        const hasAttachment = ${JSON.stringify(Boolean(this.attachment))};
        const input = document.getElementById('promptInput');
        // The view re-renders after attach/remove; keep what the user was typing.
        if (input && typeof priorState.draft === 'string') input.value = priorState.draft;
        input?.addEventListener('input', () => vscode.setState({ ...(vscode.getState() || {}), draft: input.value }));
        function send(selectionOnly) {
          if (input && (input.value.trim() || hasAttachment)) {
            vscode.postMessage({ command: 'send', text: input.value, selectionOnly });
            input.value = '';
            vscode.setState({ ...(vscode.getState() || {}), draft: '' });
          }
        }
        document.getElementById('btnSend')?.addEventListener('click', () => send(false));
        document.getElementById('btnAttach')?.addEventListener('click', () => vscode.postMessage({ command: 'attach' }));
        document.getElementById('btnRemoveAttachment')?.addEventListener('click', () => vscode.postMessage({ command: 'removeAttachment' }));
        document.getElementById('btnConfirmScan')?.addEventListener('click', () => vscode.postMessage({ command: 'confirmScanReview', id: ${JSON.stringify(this.pendingReview?.id ?? "")}, text: document.getElementById('scanReviewText')?.value || '' }));
        document.getElementById('btnCancelScan')?.addEventListener('click', () => vscode.postMessage({ command: 'cancelScanReview', id: ${JSON.stringify(this.pendingReview?.id ?? "")} }));
        document.getElementById('btnReviewSelection')?.addEventListener('click', () => send(true));
      </script>
      ${this.scanAssets ? `<script type="module">
        const vscodeBridge = window.continuityVscodeBridge;
        const moduleUri = ${JSON.stringify(this.scanAssets.moduleUri)};
        const workerUri = ${JSON.stringify(this.scanAssets.workerUri)};
        const cmapUri = ${JSON.stringify(this.scanAssets.cmapUri)};
        const activeRenders = new Map();
        window.addEventListener('message', async event => {
          const request = event.data;
          if (request?.command === 'cancelPdfRender') {
            const active = activeRenders.get(request.id);
            if (active) { active.cancelled = true; try { active.task?.cancel(); } catch {} }
            return;
          }
          if (request?.command !== 'renderPdfPage') return;
          const active = { cancelled: false, task: undefined };
          activeRenders.set(request.id, active);
          let documentTask, documentHandle, pageHandle;
          try {
            const pdfjs = await import(moduleUri);
            pdfjs.GlobalWorkerOptions.workerSrc = workerUri;
            const binary = atob(request.pdfBase64);
            const pdfBytes = Uint8Array.from(binary, character => character.charCodeAt(0));
            documentTask = pdfjs.getDocument({ data: pdfBytes, cMapUrl: cmapUri, cMapPacked: true, isEvalSupported: false });
            documentHandle = await documentTask.promise;
            if (active.cancelled) return;
            pageHandle = await documentHandle.getPage(request.page);
            const initial = pageHandle.getViewport({ scale: 1 });
            const scale = Math.min(4, 1599 / Math.max(initial.width, initial.height));
            const viewport = pageHandle.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.floor(viewport.width));
            canvas.height = Math.max(1, Math.floor(viewport.height));
            active.task = pageHandle.render({ canvasContext: canvas.getContext('2d'), viewport });
            await active.task.promise;
            const dataUrl = canvas.toDataURL('image/jpeg', 0.80);
            if ((dataUrl.length - 'data:image/jpeg;base64,'.length) * 3 / 4 > 2000000) throw new Error('Ảnh trang scan vượt giới hạn 2 MB.');
            if (!active.cancelled) vscodeBridge.postMessage({ command: 'renderedPdfPage', id: request.id, page: request.page, width: canvas.width, height: canvas.height, dataUrl });
            canvas.width = canvas.height = 0;
          } catch (error) {
            if (!active.cancelled) vscodeBridge.postMessage({ command: 'pdfRenderError', id: request.id, error: String(error) });
          } finally {
            activeRenders.delete(request.id);
            try { pageHandle?.cleanup(); } catch {}
            try { await documentHandle?.destroy(); } catch {}
            try { await documentTask?.destroy(); } catch {}
          }
        });
      </script>` : ""}
    `;

    this._view.webview.html = wrapWebviewHtml("Offline Code Assistant Chat", html, this.scanAssets?.cspSource);
  }
}

/**
 * Sidebar Composer / Diff View Provider.
 */
export class ComposerViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "continuity.assistant.composer";
  private _view?: vscode.WebviewView;

  constructor(
    private readonly onApply: (diff: string, targetFile: string) => Promise<void>
  ) {}

  private currentDiff: string = "";
  private currentFile: string = "";
  private currentCheck?: Pick<ProposalCheckResult, "status" | "diagnostics" | "rounds" | "kind">;

  setProposedDiff(diff: string, targetFile: string, check?: Pick<ProposalCheckResult, "status" | "diagnostics" | "rounds" | "kind">): void {
    this.currentDiff = diff;
    this.currentFile = targetFile;
    this.currentCheck = check;
    this.refresh();
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    this.refresh();

    webviewView.webview.onDidReceiveMessage(async message => {
      if (message.command === "apply") {
        await this.onApply(this.currentDiff, this.currentFile);
        this.currentDiff = "";
        this.currentCheck = undefined;
        this.refresh();
      } else if (message.command === "discard") {
        this.currentDiff = "";
        this.currentCheck = undefined;
        this.refresh();
      }
    });  }

  refresh(): void {
    if (!this._view) return;

    const content = this.currentDiff
      ? `
        <div>
          <h4>Target: ${escapeHtml(this.currentFile || "Active Document")}</h4>
          <p><strong>Check: ${escapeHtml(this.currentCheck?.status === "passed" ? "passed" : this.currentCheck?.status === "failed" ? this.currentCheck.kind === "execution" ? "check failed" : `still failing after ${this.currentCheck.rounds} repair round(s)` : this.currentCheck?.status === "not-configured" ? "check command not configured" : this.currentCheck?.status === "blocked-untrusted" ? "blocked: untrusted workspace" : this.currentCheck?.status === "blocked-unapproved" ? "blocked: command not approved" : this.currentCheck?.status === "cancelled" ? "cancelled" : "not checked")}</strong></p>
          ${this.currentCheck?.diagnostics && this.currentCheck.status !== "passed" ? `<pre>${escapeHtml(this.currentCheck.diagnostics.slice(0, 65536))}</pre>` : ""}
          <pre>${escapeHtml(this.currentDiff)}</pre>
          <div style="margin-top: 10px;">
            <button id="btnApply">Apply Changes</button>
            <button id="btnDiscard" class="secondary-btn">Discard</button>
          </div>
        </div>
      `
      : `<p style="color: var(--vscode-descriptionForeground);">No proposed diff pending review.</p>`;

    const html = `
      <h3>Proposed Diff Review</h3>
      ${content}
      <script>
        const vscode = acquireVsCodeApi();
        document.getElementById('btnApply')?.addEventListener('click', () => vscode.postMessage({ command: 'apply' }));
        document.getElementById('btnDiscard')?.addEventListener('click', () => vscode.postMessage({ command: 'discard' }));
      </script>
    `;

    this._view.webview.html = wrapWebviewHtml("Composer", html);
  }
}
