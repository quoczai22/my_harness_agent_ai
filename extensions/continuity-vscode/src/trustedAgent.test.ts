import test from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { extractBoundedContext, queryInlineCompletion, ContinuityInlineCompletionProvider, MAX_INLINE_PREFIX_BYTES, MAX_INLINE_SUFFIX_BYTES } from "./assistant/inlineCompletion";
import { isSensitivePath, AutoWriteAuditStore, validateAutoWriteTarget, TrustedAutoWriteGateway } from "./assistant/trustedGateway";
import { WorkspaceIndexManager, IndexedFileRecord } from "./assistant/workspaceIndex";
import { isIgnoredRelativePath, MAX_FILE_BYTES } from "./assistant/guards";
import { extractTrustedAgentProposal, buildTrustedAgentPrompt, runTrustedAgentProposal } from "./assistant/naturalProposal";

// In-memory Memento mock for tests
class MockMemento {
  private data = new Map<string, any>();
  get(key: string, defaultValue?: any): any {
    return this.data.has(key) ? this.data.get(key) : defaultValue;
  }
  async update(key: string, value: any): Promise<void> {
    if (value === undefined) {
      this.data.delete(key);
    } else {
      this.data.set(key, value);
    }
  }
}

test("command contribution: package.json declares visible applyTrustedProposal command and menus", () => {
  const pkgPath = path.resolve(__dirname, "../package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

  // Check commands
  const commands = pkg.contributes?.commands || [];
  const applyCommand = commands.find((c: any) => c.command === "continuity.applyTrustedProposal");
  assert.ok(applyCommand, "continuity.applyTrustedProposal must be declared in contributes.commands");
  assert.match(applyCommand.title, /Trusted Agent Proposal/i);

  // Check menus
  const viewTitleMenus = pkg.contributes?.menus?.["view/title"] || [];
  const menuEntry = viewTitleMenus.find((m: any) => m.command === "continuity.applyTrustedProposal");
  assert.ok(menuEntry, "continuity.applyTrustedProposal must be declared in contributes.menus");
});

test("inline completion: bounded prefix and suffix extraction", () => {
  const fakeDoc = {
    getText: () => "0123456789".repeat(1000), // 10,000 bytes
    offsetAt: (_pos: any) => 5000,
    languageId: "typescript"
  } as any;

  const ctx = extractBoundedContext(fakeDoc, {} as any, 100, 50);
  assert.equal(ctx.languageId, "typescript");
  assert.equal(Buffer.from(ctx.prefix, "utf8").length, 100);
  assert.equal(Buffer.from(ctx.suffix, "utf8").length, 50);
});

test("inline completion: cancellation and remote endpoint security", async () => {
  // Must reject remote endpoint
  await assert.rejects(
    () => queryInlineCompletion(
      { prefix: "const a = ", suffix: ";", languageId: "typescript" },
      { endpoint: "https://remote.ai.com" }
    ),
    /Security violation/
  );

  // Cancellation test with aborted signal
  const controller = new AbortController();
  controller.abort();
  const res = await queryInlineCompletion(
    { prefix: "const a = ", suffix: ";", languageId: "typescript" },
    { signal: controller.signal }
  );
  assert.equal(res, "");
});

test("inline completion: provider debounce and disabled state", async () => {
  let isEnabled = false;
  const provider = new ContinuityInlineCompletionProvider(
    () => isEnabled,
    () => "qwen2.5-coder:7b",
    undefined,
    50
  );

  const fakeDoc = {
    getText: () => "const x = 1;",
    offsetAt: () => 6,
    languageId: "typescript",
    uri: {}
  } as any;

  // Disabled returns null immediately
  const resDisabled = await provider.provideInlineCompletionItems(
    fakeDoc,
    { line: 0, character: 6 } as any,
    {} as any,
    { isCancellationRequested: false, onCancellationRequested: () => {} } as any
  );
  assert.equal(resDisabled, null);

  // Enabled with cancellation during debounce returns null
  isEnabled = true;
  const token = {
    isCancellationRequested: false,
    onCancellationRequested: () => {}
  };
  // Trigger cancellation after 10ms (before 50ms debounce completes)
  setTimeout(() => { token.isCancellationRequested = true; }, 10);
  const resCancelled = await provider.provideInlineCompletionItems(
    fakeDoc,
    { line: 0, character: 6 } as any,
    {} as any,
    token as any
  );
  assert.equal(resCancelled, null);
});

test("workspace index manager: load, persist, and clear index", async () => {
  const memento = new MockMemento();
  const manager = new WorkspaceIndexManager(memento as any);

  assert.equal(manager.getIndex(), null);

  const sampleRecord: IndexedFileRecord = {
    relativePath: "src/main.ts",
    mtimeMs: 12345678,
    sizeBytes: 150,
    summary: "export function main() {}",
    lineCount: 10,
    languageId: "ts"
  };

  await memento.update("continuity.workspaceIndex", {
    workspaceRoot: "/test/workspace",
    lastIndexedAt: new Date().toISOString(),
    files: [sampleRecord],
    totalBytes: 150
  });

  const manager2 = new WorkspaceIndexManager(memento as any);
  const index = manager2.getIndex();
  assert.notEqual(index, null);
  assert.equal(index?.files.length, 1);
  assert.equal(index?.files[0].relativePath, "src/main.ts");

  await manager2.clearIndex();
  assert.equal(manager2.getIndex(), null);
});

test("security assertion: sensitive paths detection", () => {
  assert.equal(isSensitivePath(".env"), true);
  assert.equal(isSensitivePath(".env.production"), true);
  assert.equal(isSensitivePath("config/.env.local"), true);
  assert.equal(isSensitivePath("secrets/id_rsa"), true);
  assert.equal(isSensitivePath("id_ed25519"), true);
  assert.equal(isSensitivePath("certs/server.key"), true);
  assert.equal(isSensitivePath("tls/cert.pem"), true);
  assert.equal(isSensitivePath("auth/credentials.json"), true);
  assert.equal(isSensitivePath("auth/secrets.json"), true);

  assert.equal(isSensitivePath("src/index.ts"), false);
  assert.equal(isSensitivePath("package.json"), false);
  assert.equal(isSensitivePath("README.md"), false);
});

test("security assertion: no-delete policy and unsupported operations rejected", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trusted-test-"));
  try {
    // Reject delete operation
    const deleteRes = await validateAutoWriteTarget(tmpDir, "src/file.ts", "delete" as any);
    assert.equal(deleteRes.allowed, false);
    assert.match(deleteRes.reason ?? "", /Disallowed operation/);

    // Reject shell / chmod
    const shellRes = await validateAutoWriteTarget(tmpDir, "src/file.ts", "shell" as any);
    assert.equal(shellRes.allowed, false);

    // Reject out-of-workspace traversal
    const traverseRes = await validateAutoWriteTarget(tmpDir, "../outside.ts", "create");
    assert.equal(traverseRes.allowed, false);

    // Reject sensitive path
    const envRes = await validateAutoWriteTarget(tmpDir, ".env", "create");
    assert.equal(envRes.allowed, false);

    // Reject binary path
    const binRes = await validateAutoWriteTarget(tmpDir, "image.png", "create");
    assert.equal(binRes.allowed, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("security assertion: no overwrite on create and replace requires existing file", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trusted-test-"));
  try {
    // Create an existing file
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "src", "existing.ts"), "const a = 1;");

    // Attempt create on existing file -> MUST BE REJECTED (no overwrite on create)
    const createExisting = await validateAutoWriteTarget(tmpDir, "src/existing.ts", "create");
    assert.equal(createExisting.allowed, false);
    assert.match(createExisting.reason ?? "", /already exists/i);

    // Attempt replace on existing file -> ALLOWED
    const replaceExisting = await validateAutoWriteTarget(tmpDir, "src/existing.ts", "replace");
    assert.equal(replaceExisting.allowed, true);

    // Attempt replace on non-existent file -> MUST BE REJECTED
    const replaceNonExistent = await validateAutoWriteTarget(tmpDir, "src/nonexistent.ts", "replace");
    assert.equal(replaceNonExistent.allowed, false);
    assert.match(replaceNonExistent.reason ?? "", /non-existent/i);

    // Attempt create on non-existent file -> ALLOWED
    const createNonExistent = await validateAutoWriteTarget(tmpDir, "src/newfile.ts", "create");
    assert.equal(createNonExistent.allowed, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("trusted auto-write gateway: real WorkspaceEdit transactions and audit logging", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trusted-test-"));
  try {
    const memento = new MockMemento();
    const auditStore = new AutoWriteAuditStore(memento as any);
    
    // Simulate real WorkspaceEdit applier writing to disk
    const editApplier = async (targetFsPath: string, op: "create" | "replace", content: string) => {
      fs.mkdirSync(path.dirname(targetFsPath), { recursive: true });
      fs.writeFileSync(targetFsPath, content, "utf8");
      return true;
    };

    const gateway = new TrustedAutoWriteGateway(() => true, auditStore, editApplier);

    // 1. Successful Create
    const createRes = await gateway.executeAutoWrite(tmpDir, {
      operation: "create",
      relativePath: "src/created.ts",
      content: "export const created = true;"
    });
    assert.equal(createRes.success, true);
    assert.equal(fs.readFileSync(path.join(tmpDir, "src", "created.ts"), "utf8"), "export const created = true;");

    // 2. Reject Create Overwrite on existing file
    const overwriteRes = await gateway.executeAutoWrite(tmpDir, {
      operation: "create",
      relativePath: "src/created.ts",
      content: "export const overwritten = true;"
    });
    assert.equal(overwriteRes.success, false);
    assert.match(overwriteRes.message, /already exists/i);
    // Content unchanged
    assert.equal(fs.readFileSync(path.join(tmpDir, "src", "created.ts"), "utf8"), "export const created = true;");

    // 3. Successful Replace on existing file
    const replaceRes = await gateway.executeAutoWrite(tmpDir, {
      operation: "replace",
      relativePath: "src/created.ts",
      content: "export const replaced = true;"
    });
    assert.equal(replaceRes.success, true);
    assert.equal(fs.readFileSync(path.join(tmpDir, "src", "created.ts"), "utf8"), "export const replaced = true;");

    // Verify Audit Records
    const records = auditStore.getRecords();
    assert.equal(records.length, 3);
    assert.equal(records[0].action, "create");
    assert.equal(records[0].success, true);
    assert.equal(records[1].action, "create");
    assert.equal(records[1].success, false);
    assert.equal(records[2].action, "replace");
    assert.equal(records[2].success, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("trusted agent flow: end-to-end local proposal execution into audit log", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trusted-test-"));
  try {
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "src", "app.ts"), "export function app() { return 1; }", "utf8");

    const memento = new MockMemento();
    const auditStore = new AutoWriteAuditStore(memento as any);
    const editApplier = async (targetFsPath: string, op: "create" | "replace", content: string) => {
      fs.writeFileSync(targetFsPath, content, "utf8");
      return true;
    };
    const gateway = new TrustedAutoWriteGateway(() => true, auditStore, editApplier);

    // Mock local Ollama answering with valid structured proposal
    const mockModelAnswer = `I updated the return value from 1 to 2.
\`\`\`json
{
  "path": "src/app.ts",
  "operation": "replace",
  "content": "export function app() { return 2; }"
}
\`\`\``;

    const outcome = await runTrustedAgentProposal(
      "Update return value to 2",
      "src/app.ts",
      "typescript",
      "export function app() { return 1; }",
      async () => mockModelAnswer,
      {
        execute: proposal => gateway.executeAutoWrite(tmpDir, {
          operation: proposal.operation,
          relativePath: proposal.path,
          content: proposal.content
        })
      }
    );

    assert.equal(outcome.executed, true);
    assert.equal(fs.readFileSync(path.join(tmpDir, "src", "app.ts"), "utf8"), "export function app() { return 2; }");

    const auditRecords = auditStore.getRecords();
    assert.equal(auditRecords.length, 1);
    assert.equal(auditRecords[0].relativePath, "src/app.ts");
    assert.equal(auditRecords[0].action, "replace");
    assert.equal(auditRecords[0].success, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("trusted agent flow: rejected proposal for wrong/outside path does not mutate disk", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trusted-test-"));
  try {
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "src", "app.ts"), "original content", "utf8");

    const memento = new MockMemento();
    const auditStore = new AutoWriteAuditStore(memento as any);
    const editApplier = async (targetFsPath: string, op: "create" | "replace", content: string) => {
      fs.writeFileSync(targetFsPath, content, "utf8");
      return true;
    };
    const gateway = new TrustedAutoWriteGateway(() => true, auditStore, editApplier);

    // Model tries proposing edit to a different file
    const mockModelWrongPath = `I changed another file:
\`\`\`json
{
  "path": "src/other.ts",
  "operation": "replace",
  "content": "malicious content"
}
\`\`\``;

    const outcome = await runTrustedAgentProposal(
      "Do something",
      "src/app.ts",
      "typescript",
      "original content",
      async () => mockModelWrongPath,
      {
        execute: proposal => gateway.executeAutoWrite(tmpDir, {
          operation: proposal.operation,
          relativePath: proposal.path,
          content: proposal.content
        })
      }
    );

    assert.equal(outcome.executed, false);
    assert.equal(fs.readFileSync(path.join(tmpDir, "src", "app.ts"), "utf8"), "original content");
    assert.equal(fs.existsSync(path.join(tmpDir, "src", "other.ts")), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("trusted auto-write gateway: disabled by default and audit logging", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trusted-test-"));
  try {
    const memento = new MockMemento();
    const auditStore = new AutoWriteAuditStore(memento as any);
    let isEnabled = false;

    const gateway = new TrustedAutoWriteGateway(() => isEnabled, auditStore);

    // Attempt auto-write when disabled
    const resultDisabled = await gateway.executeAutoWrite(
      tmpDir,
      { operation: "create", relativePath: "src/test.ts", content: "console.log('hi');" }
    );

    assert.equal(resultDisabled.success, false);
    assert.match(resultDisabled.message, /disabled/i);

    const records = auditStore.getRecords();
    assert.equal(records.length, 1);
    assert.equal(records[0].action, "create");
    assert.equal(records[0].relativePath, "src/test.ts");
    assert.equal(records[0].success, false);
    assert.match(records[0].reason ?? "", /disabled/i);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("trusted auto-write gateway: content size limits and binary protection", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trusted-test-"));
  try {
    const memento = new MockMemento();
    const auditStore = new AutoWriteAuditStore(memento as any);
    const gateway = new TrustedAutoWriteGateway(() => true, auditStore);

    // Content exceeds limit
    const hugeContent = "x".repeat(MAX_FILE_BYTES + 100);
    const resultHuge = await gateway.executeAutoWrite(
      tmpDir,
      { operation: "create", relativePath: "src/huge.ts", content: hugeContent }
    );
    assert.equal(resultHuge.success, false);
    assert.match(resultHuge.message, /too large/i);

    // Content contains null byte (binary)
    const binaryContent = "hello\0world";
    const resultBinary = await gateway.executeAutoWrite(
      tmpDir,
      { operation: "create", relativePath: "src/binary.ts", content: binaryContent }
    );
    assert.equal(resultBinary.success, false);
    assert.match(resultBinary.message, /binary/i);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("natural trusted-agent command contributes to Command Palette", () => {
  const manifest = JSON.parse(fs.readFileSync("package.json", "utf8")) as { contributes: { commands: Array<{ command: string }> } };
  assert.ok(manifest.contributes.commands.some(command => command.command === "continuity.applyTrustedProposal"));
  const source = fs.readFileSync("src/extension.ts", "utf8");
  assert.match(source, /Describe the change for the local offline agent/);
  assert.doesNotMatch(source, /Enter structured proposal JSON/);
});

test("natural local proposal flows through gateway and records fake audit", async () => {
  const audits: any[] = [];
  const gateway = { execute: async (request: any) => { audits.push(request); return { success: true, message: "audit recorded" }; } };
  const outcome = await runTrustedAgentProposal("add guard", "src/a.ts", "typescript", "const a = 1;", async () => "Explanation first.\n```json\n{\"path\":\"src/a.ts\",\"operation\":\"replace\",\"content\":\"const a = 2;\"}\n```", gateway);
  assert.equal(outcome.executed, true);
  assert.deepEqual(audits, [{ path: "src/a.ts", operation: "replace", content: "const a = 2;" }]);
});

test("invalid local proposal never executes trusted gateway", async () => {
  let calls = 0;
  const outcome = await runTrustedAgentProposal("do it", "src/a.ts", "typescript", "const a = 1;", async () => "```json\n{bad}\n```", { execute: async () => { calls++; return { success: true, message: "wrong" }; } });
  assert.equal(outcome.executed, false);
  assert.equal(calls, 0);
  assert.match(outcome.message, /nothing was written/);
});

test("inline completion: deterministic timeout bounds and handles delayed model responses safely", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith("/api/tags")) return new Response("{}", { status: 200 });
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    };
    const res = await queryInlineCompletion(
      { prefix: "function test() {", suffix: "}", languageId: "typescript" },
      { timeoutMs: 1, autoStart: false }
    );
    assert.equal(res, "");
  } finally { globalThis.fetch = originalFetch; }
});

test("inline completion: provider tracks diagnostics without source context leakage", async () => {
  let isEnabled = true;
  let isSafe = true;
  const provider = new ContinuityInlineCompletionProvider(
    () => isEnabled,
    () => "qwen2.5-coder:7b",
    async () => isSafe,
    10,
    () => false // autoStart false to avoid starting real process during tests
  );

  assert.equal(provider.lastDiagnostic, "idle");

  // 1. Disabled state
  isEnabled = false;
  const fakeDoc = {
    getText: () => "const greeting = 'hello';",
    offsetAt: () => 17,
    languageId: "typescript",
    uri: {}
  } as any;

  await provider.provideInlineCompletionItems(
    fakeDoc,
    { line: 0, character: 17 } as any,
    {} as any,
    { isCancellationRequested: false, onCancellationRequested: () => {} } as any
  );
  assert.equal(provider.lastDiagnostic, "disabled");

  // 2. Unsafe target path
  isEnabled = true;
  isSafe = false;
  await provider.provideInlineCompletionItems(
    fakeDoc,
    { line: 0, character: 17 } as any,
    {} as any,
    { isCancellationRequested: false, onCancellationRequested: () => {} } as any
  );
  assert.equal(provider.lastDiagnostic, "unsafe target path");

  // 3. Empty context
  isSafe = true;
  const emptyDoc = {
    getText: () => "   ",
    offsetAt: () => 1,
    languageId: "typescript",
    uri: {}
  } as any;
  await provider.provideInlineCompletionItems(
    emptyDoc,
    { line: 0, character: 1 } as any,
    {} as any,
    { isCancellationRequested: false, onCancellationRequested: () => {} } as any
  );
  assert.equal(provider.lastDiagnostic, "empty context");

  // Diagnostic strings must never leak source file code
  assert.doesNotMatch(provider.lastDiagnostic, /greeting/);
  assert.doesNotMatch(provider.lastDiagnostic, /hello/);
});
