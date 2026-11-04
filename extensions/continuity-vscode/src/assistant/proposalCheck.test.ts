import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkProposalLoop, classifyCommandError, commandHash, parseCheckCommand, type CheckOptions } from "./proposalCheck";

const source = "const okay = false;\n";
const path = "lib/main.js";
const proposal = (replacement: string) => ({ path, original: "false", replacement });

async function fixture(script: string) {
  const root = await mkdtemp(join(tmpdir(), "continuity-proposal-test-"));
  await mkdir(join(root, "lib"));
  await writeFile(join(root, path), source);
  await writeFile(join(root, "check.js"), script);
  await mkdir(join(root, "node_modules"));
  await writeFile(join(root, "node_modules", "excluded.txt"), "vendor");
  const tempPaths: string[] = [];
  const options: CheckOptions = {
    workspaceRoot: root, relativePath: path, sourceText: source, proposal: proposal("true"),
    command: `"${process.execPath}" check.js {files}`,
    timeoutSeconds: 2, trusted: true, approved: true,
    repair: async () => "", onTempCreated: value => tempPaths.push(value)
  };
  return { root, options, tempPaths, dispose: async () => rm(root, { recursive: true, force: true }) };
}

const checker = `const fs = require('node:fs'); const text = fs.readFileSync(process.argv[2], 'utf8'); if (!text.includes('const okay = true;')) { console.error('expected true'); process.exit(1); }`;

test("command parser keeps quoted executable and expands files without a shell", () => {
  assert.deepEqual(parseCheckCommand('"C:/Program Files/Python/python.exe" -m py_compile {files}', ["one.py", "two.py"]), {
    program: "C:/Program Files/Python/python.exe", args: ["-m", "py_compile", "one.py", "two.py"]
  });
  assert.throws(() => parseCheckCommand("python -m py_compile x.py && echo bad", ["x.py"]), /Shell operators/);
  assert.throws(() => parseCheckCommand("python '{files}", ["x.py"]), /Unclosed quote/);
  assert.equal(commandHash("node a.js").length, 64);
});

test("immediate pass checks modified temporary file, truncates excess output and never changes source", async () => {
  const f = await fixture(`${checker}\nprocess.stdout.write('x'.repeat(70000));`);
  try {
    const result = await checkProposalLoop(f.options);
    assert.equal(result.status, "passed");
    assert.equal(result.rounds, 0);
    assert.match(result.diagnostics, /Output truncated at 64 KiB/);
    assert.equal(await readFile(join(f.root, path), "utf8"), source);
    assert.ok(f.tempPaths.length > 0 && f.tempPaths.every(value => !existsSync(value)));
  } finally { await f.dispose(); }
});

test("one model repair can pass; failures stop after two repair rounds", async () => {
  const f = await fixture(checker);
  try {
    const prompts: string[] = [];
    const one = await checkProposalLoop({ ...f.options, proposal: proposal("false"), repair: async prompt => {
      prompts.push(prompt);
      return `\`\`\`json\n${JSON.stringify(proposal("true"))}\n\`\`\``;
    } });
    assert.equal(one.status, "passed");
    assert.equal(one.rounds, 1);
    assert.match(prompts[0], /expected true/);
    const two = await checkProposalLoop({ ...f.options, proposal: proposal("false"), repair: async () => `\`\`\`json\n${JSON.stringify(proposal("false"))}\n\`\`\`` });
    assert.equal(two.status, "failed");
    assert.equal(two.rounds, 2);
    assert.match(two.diagnostics, /expected true/);
    assert.equal(await readFile(join(f.root, path), "utf8"), source);
    assert.ok(f.tempPaths.every(value => !existsSync(value)));
  } finally { await f.dispose(); }
});

test("untrusted and unapproved commands do not copy or execute", async () => {
  const f = await fixture("require('node:fs').writeFileSync('was-run', 'yes')");
  try {
    assert.equal((await checkProposalLoop({ ...f.options, trusted: false })).status, "blocked-untrusted");
    assert.equal((await checkProposalLoop({ ...f.options, approved: false })).status, "blocked-unapproved");
    assert.deepEqual(f.tempPaths, []);
    assert.equal(existsSync(join(f.root, "was-run")), false);
  } finally { await f.dispose(); }
});

test("Windows batch command and ENOENT show executable guidance without model repair", async () => {
  const f = await fixture(checker);
  let repairs = 0;
  try {
    const options = { ...f.options, platform: "win32" as const, repair: async () => { repairs++; return ""; } };
    const batch = await checkProposalLoop({ ...options, command: "npx.cmd tsc" });
    assert.equal(batch.status, "failed");
    assert.equal(batch.kind, "execution");
    assert.equal(batch.rounds, 0);
    assert.match(batch.diagnostics, /Trên Windows không chạy được \.cmd\/\.bat/);
    const missing = await checkProposalLoop({ ...options, command: "definitely-missing-executable-987654321 arg" });
    assert.equal(missing.status, "failed");
    assert.equal(missing.kind, "execution");
    assert.equal(missing.rounds, 0);
    assert.match(missing.diagnostics, /hãy dùng file \.exe/);
    assert.equal(repairs, 0);
    assert.match(classifyCommandError(Object.assign(new Error("spawn EINVAL"), { code: "EINVAL" }), "win32").message, /hãy dùng file \.exe/);
    assert.equal(classifyCommandError(Object.assign(new Error("spawn EINVAL"), { code: "EINVAL" }), "win32").kind, "execution");
    assert.ok(f.tempPaths.every(value => !existsSync(value)));
  } finally { await f.dispose(); }
});

test("sessions and .vscode are skipped only at the project root", async () => {
  const f = await fixture(`const fs = require('node:fs');
    const needed = ['nested/sessions/keep.txt', 'nested/.vscode/keep.txt'];
    if (!needed.every(path => fs.existsSync(path))) process.exit(2);
    if (fs.existsSync('sessions/secret.txt') || fs.existsSync('.vscode/secret.txt')) process.exit(3);`);
  try {
    for (const name of ["sessions", ".vscode"]) {
      await mkdir(join(f.root, name));
      await writeFile(join(f.root, name, "secret.txt"), "root-only");
      await mkdir(join(f.root, "nested", name), { recursive: true });
      await writeFile(join(f.root, "nested", name, "keep.txt"), "nested");
    }
    const result = await checkProposalLoop(f.options);
    assert.equal(result.status, "passed");
    assert.ok(f.tempPaths.every(value => !existsSync(value)));
  } finally { await f.dispose(); }
});

test("temporary copy reports the exact limit hit and does not run a partial check", async () => {
  const f = await fixture("require('node:fs').writeFileSync('was-run', 'yes')");
  try {
    await writeFile(join(f.root, "oversized.txt"), "x".repeat(2 * 1024 * 1024 + 1));
    const result = await checkProposalLoop(f.options);
    assert.equal(result.status, "failed");
    assert.match(result.diagnostics, /oversized\.txt exceeds 2 MiB per file/);
    assert.equal(existsSync(join(f.root, "was-run")), false);
    assert.ok(f.tempPaths.every(value => !existsSync(value)));
  } finally { await f.dispose(); }
});

test("timeout terminates fake command and removes only owned temporary directories", async () => {
  const f = await fixture("setTimeout(() => {}, 20000)");
  try {
    const result = await checkProposalLoop({ ...f.options, timeoutSeconds: 1, killTree: async child => { child.kill("SIGKILL"); } });
    assert.equal(result.status, "failed");
    assert.match(result.diagnostics, /timed out/);
    assert.ok(f.tempPaths.every(value => !existsSync(value)));
    assert.equal(await readFile(join(f.root, path), "utf8"), source);
  } finally { await f.dispose(); }
});

test("cancel mid-check terminates command, cleans temp and reports cancelled", async () => {
  const f = await fixture("setTimeout(() => {}, 20000)");
  const controller = new AbortController();
  let killed = false;
  try {
    const pending = checkProposalLoop({ ...f.options, signal: controller.signal, killTree: async child => { killed = true; child.kill("SIGKILL"); } });
    setTimeout(() => controller.abort(), 100);
    const result = await pending;
    assert.equal(result.status, "cancelled");
    assert.equal(killed, true);
    assert.ok(f.tempPaths.every(value => !existsSync(value)));
    assert.equal(await readFile(join(f.root, path), "utf8"), source);
  } finally { await f.dispose(); }
});

test("manifest declares trust restriction and Composer renders check status without vscode runtime import", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(manifest.version, "0.3.5");
  assert.deepEqual(manifest.capabilities.untrustedWorkspaces.restrictedConfigurations, ["continuity.assistant.checkCommand"]);
  assert.equal(manifest.contributes.configuration.properties["continuity.assistant.checkTimeoutSeconds"].default, 120);
  const sidebar = readFileSync("src/sidebarViews.ts", "utf8");
  assert.match(sidebar, /still failing after/);
  const extension = readFileSync("src/extension.ts", "utf8");
  assert.match(extension, /workspace\.isTrusted/);
  assert.match(extension, /workspaceState\.update\(approvalKey/);
  assert.match(extension, /cancellable: true/);
});
