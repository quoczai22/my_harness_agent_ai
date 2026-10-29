import * as vscode from "vscode";
import { randomUUID } from "node:crypto";
import { AssistantStore, ChatSession } from "./assistantStore";
import { renderNonceProtectedHtml, renderSafeMarkdown } from "./chatResponse";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;"
  })[c] ?? c);
}

function promptPreview(value: string, maxLength = 160): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

/**
 * Common secure HTML wrapper with strict Content Security Policy.
 */
export function wrapWebviewHtml(title: string, bodyContent: string): string {
  const nonce = randomUUID();
  const safeBody = bodyContent.replace(/<script>/g, `<script nonce="${nonce}">`);
  const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-';">
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

  constructor(
    private readonly store: AssistantStore,
    private readonly onSendPrompt: (prompt: string, selectionOnly: boolean) => Promise<void>
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    this.refresh();

    webviewView.webview.onDidReceiveMessage(async message => {
      if (message.command === "send") {
        await this.onSendPrompt(message.text, message.selectionOnly);
        this.refresh();
      }
    });  }

  refresh(): void {
    if (!this._view) return;
    const state = this.store.getState();
    const active = state.sessions.find(s => s.id === state.activeSessionId);
    const profile = state.styleProfile;

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
        <strong>${m.sender === 'user' ? 'You' : 'Ollama (qwen2.5-coder)'}:</strong>
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
      <textarea id="promptInput" rows="3" placeholder="Ask qwen2.5-coder or review selection..."></textarea>
      <div>
        <button id="btnSend">Send File/Prompt</button>
        <button id="btnReviewSelection" class="secondary-btn">Review Selection</button>
      </div>
      <script>
        const vscode = acquireVsCodeApi();
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
          vscode.setState({ latestMessageId, scrollTop: messages.scrollTop });
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
        function send(selectionOnly) {
          const input = document.getElementById('promptInput');
          if (input && input.value.trim()) {
            vscode.postMessage({ command: 'send', text: input.value, selectionOnly });
            input.value = '';
          }
        }
        document.getElementById('btnSend')?.addEventListener('click', () => send(false));
        document.getElementById('btnReviewSelection')?.addEventListener('click', () => send(true));
      </script>
    `;

    this._view.webview.html = wrapWebviewHtml("Offline Code Assistant Chat", html);
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

  setProposedDiff(diff: string, targetFile: string): void {
    this.currentDiff = diff;
    this.currentFile = targetFile;
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
        this.refresh();
      } else if (message.command === "discard") {
        this.currentDiff = "";
        this.refresh();
      }
    });  }

  refresh(): void {
    if (!this._view) return;

    const content = this.currentDiff
      ? `
        <div>
          <h4>Target: ${escapeHtml(this.currentFile || "Active Document")}</h4>
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
