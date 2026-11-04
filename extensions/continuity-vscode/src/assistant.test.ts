import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  isIgnoredPath,
  sanitizeWorkspaceContext,
  validateOllamaEndpoint,
  extractStyleProfile,
  applyProposedDiff,
  DEFAULT_OLLAMA_HOST,
  DEFAULT_OLLAMA_MODEL,
  MAX_FILE_SIZE_BYTES,
  MAX_CONTEXT_BYTES
} from "./assistant";
import { AssistantStore, parsePortableSessions } from "./assistantStore";

test("portable sessions round-trip with explicit merge and reject malformed exports", async () => {
  const first: Record<string, unknown> = {};
  const memento = (data: Record<string, unknown>) => ({ get: <T>(key: string) => data[key] as T | undefined, update: async (key: string, value: unknown) => { data[key] = value; } });
  const source = new AssistantStore(memento(first));
  const session = await source.createSession("Portable");
  await source.addMessage(session.id, { sender: "user", text: "Continue offline" });
  await source.setPendingAgentTask(session.id, "Read project file");
  const exportBytes = source.exportSessions();
  const parsed = parsePortableSessions(exportBytes);
  const destination = new AssistantStore(memento({}));
  await destination.importSessions(parsed, "merge");
  assert.equal(destination.getState().sessions[0].messages[0].text, "Continue offline");
  assert.equal(destination.getState().sessions[0].pendingAgentTask, "Read project file");
  await destination.importSessions(parsed, "merge");
  assert.equal(destination.getState().sessions.length, 1);
  assert.throws(() => parsePortableSessions(new TextEncoder().encode('{"schema":2,"sessions":[]}')), /Unsupported/);
});

test("pending agent question survives store reload and clears after resumption", async () => {
  const data: Record<string, unknown> = {};
  const memento = { get: <T>(key: string) => data[key] as T | undefined, update: async (key: string, value: unknown) => { data[key] = value; } };
  const store = new AssistantStore(memento);
  const session = await store.createSession("Agent");
  await store.setPendingAgentTask(session.id, "Choose a framework");
  assert.equal(new AssistantStore(memento).getState().sessions[0].pendingAgentTask, "Choose a framework");
  await store.setPendingAgentTask(session.id, undefined);
  assert.equal(new AssistantStore(memento).getState().sessions[0].pendingAgentTask, undefined);
});
import { DEFAULT_OFFLINE_OLLAMA_TIMEOUT_MS, ensureLocalOllamaService, OLLAMA_TAGS_URL, queryOfflineOllama, resolveOfflineOllamaTimeout } from "./ollamaClient";
import { renderNonceProtectedHtml, renderSafeMarkdown, splitAssistantResponse } from "./chatResponse";
import { wrapWebviewHtml, SessionsViewProvider, ChatViewProvider, localQueryFailure, type LocalModelLabel } from "./sidebarViews";

test("security assertion: ignore filtering blocks .git, node_modules, dist, .env, and binary files", () => {
  // Ignored directory paths
  assert.equal(isIgnoredPath(".git/config"), true);
  assert.equal(isIgnoredPath("src/.git/HEAD"), true);
  assert.equal(isIgnoredPath("node_modules/express/index.js"), true);
  assert.equal(isIgnoredPath("packages/sub/node_modules/foo/package.json"), true);
  assert.equal(isIgnoredPath("dist/bundle.js"), true);
  assert.equal(isIgnoredPath("build/output.min.js"), true);

  // Environment and secret files
  assert.equal(isIgnoredPath(".env"), true);
  assert.equal(isIgnoredPath(".env.local"), true);
  assert.equal(isIgnoredPath("server/.env.production"), true);

  // Binary extensions
  assert.equal(isIgnoredPath("media/logo.png"), true);
  assert.equal(isIgnoredPath("assets/font.woff2"), true);
  assert.equal(isIgnoredPath("bin/server.exe"), true);
  assert.equal(isIgnoredPath("lib/native.so"), true);
  assert.equal(isIgnoredPath("extension.vsix"), true);

  // Allowed source files
  assert.equal(isIgnoredPath("src/index.ts"), false);
  assert.equal(isIgnoredPath("components/App.tsx"), false);
  assert.equal(isIgnoredPath("package.json"), false);
  assert.equal(isIgnoredPath("README.md"), false);
});

test("context tests: bounds enforcement, file size caps, and overflow truncation", () => {
  const files = [
    { path: "src/valid1.ts", content: "const a = 1;", sizeBytes: 100 },
    { path: "node_modules/bad.js", content: "ignored", sizeBytes: 50 },
    { path: "src/huge.ts", content: "huge".repeat(10000), sizeBytes: MAX_FILE_SIZE_BYTES + 500 },
    { path: "src/valid2.ts", content: "const b = 2;", sizeBytes: 200 }
  ];

  const result = sanitizeWorkspaceContext(files, MAX_FILE_SIZE_BYTES, MAX_CONTEXT_BYTES);
  assert.equal(result.accepted.length, 2);
  assert.equal(result.accepted[0].path, "src/valid1.ts");
  assert.equal(result.accepted[1].path, "src/valid2.ts");
  assert.equal(result.totalBytes, 300);

  assert.equal(result.rejected.length, 2);
  assert.equal(result.rejected[0].path, "node_modules/bad.js");
  assert.equal(result.rejected[1].path, "src/huge.ts");
});

test("security assertion: strict loopback isolation restricts endpoint to 127.0.0.1", () => {
  // Allowed loopback endpoints
  const loopback1 = validateOllamaEndpoint("http://127.0.0.1:11434");
  assert.equal(loopback1.valid, true);

  for (const rejected of ["http://localhost:11434", "http://127.0.0.1:9999", "https://127.0.0.1:11434", "http://127.0.0.1:11434/api/generate"]) {
    assert.equal(validateOllamaEndpoint(rejected).valid, false);
  }

  // Rejected remote / cloud endpoints
  const remote1 = validateOllamaEndpoint("https://api.openai.com");
  assert.equal(remote1.valid, false);
  assert.match(remote1.error || "", /Security violation/);

  const remote2 = validateOllamaEndpoint("http://192.168.1.100:11434");
  assert.equal(remote2.valid, false);

  const remote3 = validateOllamaEndpoint("https://ollama.external.domain.com");
  assert.equal(remote3.valid, false);

  // Default constants
  assert.equal(DEFAULT_OLLAMA_HOST, "http://127.0.0.1:11434");
  assert.equal(DEFAULT_OLLAMA_MODEL, "qwen2.5-coder:7b");
});

test("ollama client: queryOfflineOllama rejects remote endpoint", async () => {
  await assert.rejects(
    () => queryOfflineOllama("test prompt", { endpoint: "https://remote.ai.server.com" }),
    /Security violation/
  );
});

test("assistant store: session management and local storage operations", async () => {
  const memoryStore: Record<string, any> = {};
  const mockMemento: any = {
    get: (key: string) => memoryStore[key],
    update: async (key: string, val: any) => { memoryStore[key] = val; }
  };

  const store = new AssistantStore(mockMemento);
  const session1 = await store.createSession("Chat 1");
  assert.equal(store.getState().sessions.length, 1);
  assert.equal(store.getState().activeSessionId, session1.id);

  const msg = await store.addMessage(session1.id, {
    sender: "user",
    text: "Review this code"
  });
  assert.equal(msg.text, "Review this code");
  assert.equal(store.getState().sessions[0].messages.length, 1);

  const session2 = await store.createSession("Chat 2");
  assert.equal(store.getState().sessions.length, 2);

  await store.deleteSession(session1.id);
  assert.equal(store.getState().sessions.length, 1);
  assert.equal(store.getState().sessions[0].id, session2.id);

  await store.clearAllSessions();
  assert.equal(store.getState().sessions.length, 0);
  assert.equal(store.getState().activeSessionId, null);
});

test("style profile extraction: derives indentation, quote preference, and semicolon style", () => {
  const samples = [
    {
      path: "src/file1.ts",
      content: `
  const a = 'hello';
  const b = 'world';
  function test() {
    return a + b;
  }
`
    },
    {
      path: "src/file2.ts",
      content: `
  const c = 'item';
  export default c;
`
    },
    {
      path: "dist/ignored.js",
      content: `\tvar x = "double";`
    }
  ];

  const profile = extractStyleProfile(samples);
  assert.equal(profile.indentation, "spaces_2");
  assert.equal(profile.quotes, "single");
  assert.equal(profile.semicolons, true);
  assert.equal(profile.extractedFromFilesCount, 2); // ignored dist file excluded
});

test("security assertion: diff confirmation gate disallows unconfirmed writes", () => {
  const plan = {
    targetFile: "src/calculator.ts",
    originalSnippet: "return a - b;",
    proposedSnippet: "return a + b;"
  };

  // Rejection when userConfirmed is false
  const unconfirmed = applyProposedDiff(false, plan);
  assert.equal(unconfirmed.applied, false);
  assert.match(unconfirmed.reason, /Explicit user confirmation is required/);

  // Rejection when target is an ignored/sensitive file
  const ignoredTarget = applyProposedDiff(true, {
    targetFile: ".env",
    originalSnippet: "SECRET=1",
    proposedSnippet: "SECRET=2"
  });
  assert.equal(ignoredTarget.applied, false);
  assert.match(ignoredTarget.reason, /sensitive file/);

  // Approval when userConfirmed is true on valid workspace file
  const confirmed = applyProposedDiff(true, plan);
  assert.equal(confirmed.applied, true);
  assert.match(confirmed.reason, /verified and approved/);
});

test("local Ollama timeout defaults to bounded 90 seconds and supports explicit override", () => {
  assert.equal(DEFAULT_OFFLINE_OLLAMA_TIMEOUT_MS, 90_000);
  assert.equal(resolveOfflineOllamaTimeout(), 90_000);
  assert.equal(resolveOfflineOllamaTimeout(1_500), 1_500);
  assert.throws(() => resolveOfflineOllamaTimeout(0), /positive finite/);
});

test("natural chat retains its answer and extracts only a valid matching proposal", () => {
  const response = "Use a guard clause before parsing input.\n\n```json\n{\"path\":\"src/a.ts\",\"original\":\"if (x) {}\",\"replacement\":\"if (!x) return;\"}\n```";
  const parsed = splitAssistantResponse(response, "src/a.ts");
  assert.match(parsed.answer, /guard clause/);
  assert.deepEqual(parsed.proposal, { path: "src/a.ts", original: "if (x) {}", replacement: "if (!x) return;" });
});

test("invalid or mismatched JSON proposal remains visible in the normal answer", () => {
  const invalid = "Here is why it fails.\n```json\n{not json}\n```";
  assert.equal(splitAssistantResponse(invalid, "src/a.ts").answer, invalid);
  const mismatched = "Suggestion first.\n```json\n{\"path\":\"src/b.ts\",\"original\":\"a\",\"replacement\":\"b\"}\n```";
  assert.equal(splitAssistantResponse(mismatched, "src/a.ts").proposal, undefined);
  assert.match(splitAssistantResponse(mismatched, "src/a.ts").answer, /src\/b.ts/);
});

test("safe Markdown escapes untrusted HTML while keeping readable code blocks", () => {
  const rendered = renderSafeMarkdown("Hello **there**\n```ts\n<script>alert(1)</script>\nconst x = 1;\n```");
  assert.match(rendered, /<strong>there<\/strong>/);
  assert.match(rendered, /<pre><code/);
  assert.match(rendered, /&lt;script&gt;/);
  assert.doesNotMatch(rendered, /<script>/);
});

test("rendered webview CSP uses a non-empty matching nonce and model text cannot inject scripts", () => {
  const nonce = "nonce-regression-123";
  const model = renderSafeMarkdown("<script>evil()</script>");
  const html = renderNonceProtectedHtml(`<div>${model}</div><script>const vscode = acquireVsCodeApi();</script>`, nonce);
  assert.match(html, /script-src 'nonce-nonce-regression-123'/);
  assert.match(html, /<script nonce="nonce-regression-123">const vscode/);
  assert.match(html, /&lt;script&gt;evil/);
  assert.doesNotMatch(html, /<script>evil/);
});

test("assistant webviews avoid inline event attributes and bind controls from nonce scripts", () => {
  const sidebarPath = existsSync("src/sidebarViews.ts") ? "src/sidebarViews.ts" : "extensions/continuity-vscode/src/sidebarViews.ts";
  const source = readFileSync(sidebarPath, "utf8");
  assert.doesNotMatch(source, /\son[a-z]+\s*=/i);
  for (const id of ["btnNewSession", "btnClearAll", "btnSend", "btnReviewSelection", "btnApply", "btnDiscard"]) assert.match(source, new RegExp(`getElementById\\('${id}'\\)\\?\\.addEventListener`));
  assert.match(source, /safeBody = bodyContent\.replace\(\/&lt;script&gt;\/|safeBody = bodyContent\.replace\(\/<script>/);
  assert.match(source, /script-src 'nonce-\$\{nonce\}'/);
});

test("chat timeline renders stable prompt anchors and preserves/follows scroll through webview state", () => {
  const sidebarPath = existsSync("src/sidebarViews.ts") ? "src/sidebarViews.ts" : "extensions/continuity-vscode/src/sidebarViews.ts";
  const source = readFileSync(sidebarPath, "utf8");
  assert.match(source, /id="message-\$\{escapeHtml\(m\.id\)\}"/);
  assert.match(source, /data-jump-target="message-\$\{escapeHtml\(message\.id\)\}"/);
  assert.match(source, /title="\$\{escapeHtml\(preview\)\}"/);
  assert.match(source, /aria-label="Jump to prompt: \$\{escapeHtml\(preview\)\}"/);
  assert.match(source, /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
  assert.match(source, /priorState\.latestMessageId !== latestMessageId/);
  assert.match(source, /messages\.scrollTop = messages\.scrollHeight/);
  assert.match(source, /Math\.min\(priorState\.scrollTop/);
  assert.match(source, /messages\?\.addEventListener\('scroll'/);
  assert.match(source, /requestAnimationFrame/);
});
test("Ollama auto-start uses only fixed no-shell local serve and waits for readiness", async () => {
  let probes = 0;
  const launches: Array<{ command: string; args: readonly string[]; options: any }> = [];
  await ensureLocalOllamaService({
    fetchImpl: async (url: string) => {
      assert.equal(url, OLLAMA_TAGS_URL);
      probes++;
      return { ok: probes >= 2 };
    },
    spawnImpl: (command, args, options) => {
      launches.push({ command, args, options });
      return { unref() {} };
    },
    sleep: async () => {},
    startupTimeoutMs: 20,
    pollIntervalMs: 1
  });
  assert.equal(launches.length, 1);
  assert.deepEqual(launches[0].args, ["serve"]);
  assert.equal(launches[0].command, "ollama");
  assert.equal(launches[0].options.shell, false);
  assert.equal(launches[0].options.windowsHide, true);
});

test("Ollama auto-start respects opt-out and does not launch a process", async () => {
  let launched = false;
  await assert.rejects(() => ensureLocalOllamaService({
    autoStart: false,
    fetchImpl: async () => ({ ok: false }),
    spawnImpl: () => { launched = true; return { unref() {} }; }
  }), /ollamaAutoStart/);
  assert.equal(launched, false);
});

test("session context isolation: selectSession updates activeSessionId and persists state", async () => {
  const memoryStore: Record<string, any> = {};
  const mockMemento: any = {
    get: (key: string) => memoryStore[key],
    update: async (key: string, val: any) => { memoryStore[key] = val; }
  };

  const store = new AssistantStore(mockMemento);
  const session1 = await store.createSession("First Session");
  const session2 = await store.createSession("Second Session");

  assert.equal(store.getState().activeSessionId, session2.id);

  await store.selectSession(session1.id);
  assert.equal(store.getState().activeSessionId, session1.id);

  // Persistence check across reload
  const reloadedStore = new AssistantStore(mockMemento);
  assert.equal(reloadedStore.getState().activeSessionId, session1.id);

  await assert.rejects(
    () => store.selectSession("nonexistent-session-id"),
    /Session 'nonexistent-session-id' not found/
  );
});

test("session context isolation: bounded history is isolated per session, bounds length, and excludes system messages", async () => {
  const memoryStore: Record<string, any> = {};
  const mockMemento: any = {
    get: (key: string) => memoryStore[key],
    update: async (key: string, val: any) => { memoryStore[key] = val; }
  };

  const store = new AssistantStore(mockMemento);
  const sessionA = await store.createSession("Session A");
  const sessionB = await store.createSession("Session B");

  // Add messages to Session A: user, assistant, and system diagnostic error
  await store.addMessage(sessionA.id, { sender: "user", text: "How do I sort an array?" });
  await store.addMessage(sessionA.id, { sender: "assistant", text: "Use array.sort((a, b) => a - b);" });
  await store.addMessage(sessionA.id, { sender: "system", text: "Error: Ollama connection timeout" });

  // Add messages to Session B
  await store.addMessage(sessionB.id, { sender: "user", text: "Explain React hooks." });
  await store.addMessage(sessionB.id, { sender: "assistant", text: "Hooks allow state in functional components." });

  // Session A bounded conversation contains only Session A user/assistant messages
  const convA = store.getBoundedConversation(sessionA.id);
  assert.match(convA, /User: How do I sort an array\?/);
  assert.match(convA, /Assistant: Use array\.sort/);
  assert.doesNotMatch(convA, /Ollama connection timeout/);
  assert.doesNotMatch(convA, /React hooks/);

  // Session B bounded conversation contains only Session B user/assistant messages
  const convB = store.getBoundedConversation(sessionB.id);
  assert.match(convB, /User: Explain React hooks\./);
  assert.match(convB, /Assistant: Hooks allow state/);
  assert.doesNotMatch(convB, /sort an array/);
  assert.doesNotMatch(convB, /Ollama connection timeout/);

  // Brand new session C starts with empty conversation history
  const sessionC = await store.createSession("Session C");
  const convC = store.getBoundedConversation(sessionC.id);
  assert.equal(convC, "");

  // Bounded length truncation
  const boundedA = store.getBoundedConversation(sessionA.id, 30);
  assert.match(boundedA, /^\[Earlier messages omitted\]/);
  assert.ok(boundedA.length <= 60);
});

test("session context isolation: sidebar sessions view binds selectSession, highlights active session, and notifies chat refresh", async () => {
  const memoryStore: Record<string, any> = {};
  const mockMemento: any = {
    get: (key: string) => memoryStore[key],
    update: async (key: string, val: any) => { memoryStore[key] = val; }
  };

  const store = new AssistantStore(mockMemento);
  const session1 = await store.createSession("Chat 1");
  const session2 = await store.createSession("Chat 2");
  await store.selectSession(session1.id);

  let refreshNotified = false;
  const sessionsViewProvider = new SessionsViewProvider(store, () => {
    refreshNotified = true;
  });

  let messageHandler: ((msg: any) => Promise<void> | void) | undefined;
  let renderedHtml = "";

  const mockWebviewView: any = {
    webview: {
      options: {},
      set html(val: string) { renderedHtml = val; },
      get html() { return renderedHtml; },
      onDidReceiveMessage(handler: any) {
        messageHandler = handler;
        return { dispose() {} };
      }
    }
  };

  sessionsViewProvider.resolveWebviewView(mockWebviewView);

  // Verify HTML contains active session styling and selection attributes
  assert.match(renderedHtml, /class="card session-active"/);
  assert.match(renderedHtml, new RegExp(`data-select-session="${session1.id}"`));
  assert.match(renderedHtml, new RegExp(`data-select-session="${session2.id}"`));
  assert.match(renderedHtml, /\.session-active/);

  // Simulate selecting session 2
  assert.ok(messageHandler);
  refreshNotified = false;
  await messageHandler({ command: "selectSession", sessionId: session2.id });

  assert.equal(store.getState().activeSessionId, session2.id);
  assert.equal(refreshNotified, true);
  assert.match(renderedHtml, new RegExp(`data-select-session="${session2.id}"[^>]*>Chat 2 \\(0 msgs\\) — Active`));
});
test("session selection persists and bounded conversation excludes other sessions and system messages", async () => {
  const data: Record<string, unknown> = {};
  const store = new AssistantStore({ get: <T>(key: string) => data[key] as T | undefined, update: async (key: string, value: unknown) => { data[key] = value; } });
  const first = await store.createSession("First");
  await store.addMessage(first.id, { sender: "user", text: "first-user" });
  await store.addMessage(first.id, { sender: "system", text: "first-system-secret" });
  const second = await store.createSession("Second");
  await store.addMessage(second.id, { sender: "assistant", text: "second-assistant" });
  await store.selectSession(first.id);
  assert.equal(store.getState().activeSessionId, first.id);
  const history = store.getBoundedConversation(first.id, 20);
  assert.match(history, /first-user/);
  assert.doesNotMatch(history, /first-system-secret|second-assistant/);
  assert.ok(history.length <= 20 || history.startsWith("[Earlier messages omitted]"));
});

test("Sessions webview binds selection controls and marks active row", () => {
  const source = readFileSync("src/sidebarViews.ts", "utf8");
  assert.match(source, /data-select-session/);
  assert.match(source, /command: 'selectSession'/);
  assert.match(source, /session-active/);
  assert.match(source, /onSessionChanged\(\)/);
});

test("chat labels and placeholder follow configured provider/model on refresh", async () => {
  const data: Record<string, unknown> = {};
  const store = new AssistantStore({ get: <T>(key: string) => data[key] as T | undefined, update: async (key: string, value: unknown) => { data[key] = value; } });
  const session = await store.createSession("Labels");
  await store.addMessage(session.id, { sender: "user", text: "hello" });
  await store.addMessage(session.id, { sender: "assistant", text: "answer" });
  await store.addMessage(session.id, { sender: "system", text: "error" });
  let configured: LocalModelLabel = { provider: "ollama", model: "coder:7b" };
  let html = "";
  const view: any = { webview: {
    options: {},
    set html(value: string) { html = value; },
    onDidReceiveMessage() { return { dispose() {} }; }
  } };
  const chat = new ChatViewProvider(store, async () => {}, async () => undefined, () => configured);
  chat.resolveWebviewView(view);
  assert.match(html, /<strong>You:<\/strong>/);
  assert.match(html, /<strong>Ollama \(coder:7b\):<\/strong>/);
  assert.match(html, /<strong>System:<\/strong>/);
  assert.match(html, /placeholder="Ask Ollama \(coder:7b\),/);

  configured = { provider: "lmstudio", model: "qwen3.5-2b" };
  chat.refresh();
  assert.match(html, /<strong>LM Studio \(qwen3\.5-2b\):<\/strong>/);
  assert.match(html, /placeholder="Ask LM Studio \(qwen3\.5-2b\),/);
  assert.doesNotMatch(html, /Ollama \(coder:7b\)/);

  configured = { provider: "lmstudio", model: '<script>alert("x")</script>' };
  chat.refresh();
  assert.match(html, /LM Studio \(&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;\)/);
  assert.doesNotMatch(html, /<strong>LM Studio \(<script>/);

  configured = { provider: "lmstudio", model: "" };
  chat.refresh();
  assert.match(html, /LM Studio \(model not selected\)/);
  assert.doesNotMatch(html, /qwen2\.5-coder/);
});

test("generic query failure names the selected provider", () => {
  assert.equal(localQueryFailure("ollama"), "Ollama query failed.");
  assert.equal(localQueryFailure("lmstudio"), "LM Studio query failed.");
  const source = readFileSync("src/extension.ts", "utf8");
  assert.match(source, /localQueryFailure\(currentLocalModel\(\)\.provider\)/);
  assert.match(source, /onDidChangeConfiguration/);
});
