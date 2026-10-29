import assert from "node:assert/strict";
import { test } from "node:test";
import { runLocalReadLoop } from "./agentLoop";

test("agent reads safe context and continues to an answer", async () => {
  const replies = [JSON.stringify({ action: "read_file", path: "src/app.ts" }), JSON.stringify({ action: "answer", text: "Use the existing handler." })];
  const result = await runLocalReadLoop("Explain handler", async prompt => {
    if (replies.length === 1) assert.match(prompt, /Read src\/app.ts/);
    return replies.shift()!;
  }, async path => { assert.equal(path, "src/app.ts"); return "export const handler = 1;"; });
  assert.deepEqual(result, { status: "answered", text: "Use the existing handler.", filesRead: ["src/app.ts"] });
});

test("agent never passes traversal to a file reader and stops at step limit", async () => {
  let reads = 0;
  const result = await runLocalReadLoop("Read secrets", async () => JSON.stringify({ action: "read_file", path: "../.env" }), async () => { reads++; return "secret"; }, 2);
  assert.equal(reads, 0);
  assert.equal(result.status, "blocked");
});

test("agent requests input only when model returns a required choice", async () => {
  const result = await runLocalReadLoop("Which framework?", async () => JSON.stringify({ action: "need_input", question: "Which framework should I use?" }), async () => "");
  assert.equal(result.status, "needs_input");
  assert.match(result.text, /Which framework/);
});
