import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { runAntigravity, serializeAntigravityContext } from "./antigravityAdapter.js";
import type { ContextPacket } from "./universalHarness.js";

function packet(): ContextPacket {
  return {
    workspaceId: "fixture",
    projectName: "Fixture Project",
    prompt: "Explain the selected code",
    mode: "antigravity",
    technologies: ["TypeScript"],
    instructions: [{ path: "AGENTS.md", content: "Untrusted project instruction" }],
    files: [{ path: "src/main.ts", content: "export const answer = 42;", truncated: false }],
    budget: { usedCharacters: 80, maximumCharacters: 4000 },
  };
}

test("Antigravity context clearly bounds project content as untrusted read-only data", () => {
  const text = serializeAntigravityContext(packet());
  assert.match(text, /read-only proposal mode/);
  assert.match(text, /untrusted data/);
  assert.match(text, /src\/main\.ts/);
  assert.match(text, /Explain the selected code/);
});

test("Antigravity runner streams context, parses proposals, and uses an isolated runtime", async () => {
  const root = resolve("tmp", `agy-adapter-${randomUUID()}`);
  const runtime = join(root, "runtime");
  const capture = join(root, "capture.json");
  const fake = join(root, "fake-agy.mjs");
  mkdirSync(root, { recursive: true });
  writeFileSync(fake, [
    'import { writeFileSync } from "node:fs";',
    'let input = "";',
    'for await (const chunk of process.stdin) input += chunk;',
    `writeFileSync(${JSON.stringify(capture)}, JSON.stringify({ input, cwd: process.cwd(), args: process.argv.slice(2) }));`,
    'process.stdout.write(JSON.stringify({ event: "result", result: { status: "SUCCESS", response: "fallback", conversation_id: "conv-1", usage: { total_tokens: 12 }, structured_output: { answer: "Reviewed safely", proposals: [{ path: "src/main.ts", summary: "Use a named constant", replacement: "export const answer = 43;" }] } } }) + "\\n");',
  ].join("\n"), "utf8");
  try {
    const result = await runAntigravity(packet(), {
      executable: process.execPath,
      prefixArgs: [fake],
      runtimeRoot: runtime,
      timeoutMs: 10_000,
    });
    const captured = JSON.parse(readFileSync(capture, "utf8"));
    assert.equal(result.status, "SUCCESS");
    assert.equal(result.response, "Reviewed safely");
    assert.equal(result.conversationId, "conv-1");
    assert.equal(result.usage?.total_tokens, 12);
    assert.deepEqual(result.proposals.map((item) => item.path), ["src/main.ts"]);
    assert.match(captured.input, /SELECTED PROJECT FILE/);
    assert.ok(resolve(captured.cwd).startsWith(resolve(runtime)));
    assert.ok(captured.args.includes("--sandbox"));
    assert.ok(captured.args.includes("plan"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
