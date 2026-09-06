import test from "node:test";
import assert from "node:assert/strict";
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
import { AssistantStore } from "./assistantStore";
import { DEFAULT_OFFLINE_OLLAMA_TIMEOUT_MS, queryOfflineOllama, resolveOfflineOllamaTimeout } from "./ollamaClient";
import { renderNonceProtectedHtml, renderSafeMarkdown, splitAssistantResponse } from "./chatResponse";

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
