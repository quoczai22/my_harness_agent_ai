import test from "node:test";
import assert from "node:assert/strict";
import { findRelevantFiles, formatRetrievedContext, isIndexForWorkspace, MAX_RETRIEVED_FILES, MAX_RETRIEVED_TOTAL_BYTES } from "./retrieval";

const files = [
  { relativePath: "src/sort_numbers.py", summary: "def sort_numbers(values): return sorted(values)", mtimeMs: 0, sizeBytes: 20, lineCount: 1, languageId: "py" },
  { relativePath: "src/search.py", summary: "binary search helper", mtimeMs: 0, sizeBytes: 20, lineCount: 1, languageId: "py" },
  { relativePath: "README.md", summary: "project documentation", mtimeMs: 0, sizeBytes: 20, lineCount: 1, languageId: "md" }
];

test("retrieval ranks an exact filename before similar workspace matches", () => {
  const found = findRelevantFiles("review sort_numbers.py and improve sort logic", files);
  assert.equal(found[0].relativePath, "src/sort_numbers.py");
  assert.equal(found[0].match, "exact");
  assert.ok(found.length <= MAX_RETRIEVED_FILES);
});

test("retrieval context labels files and enforces a total byte cap", () => {
  const context = formatRetrievedContext([{ relativePath: "src/a.py", language: "python", text: "x".repeat(MAX_RETRIEVED_TOTAL_BYTES * 2) }]);
  assert.match(context, /Relevant local file: src\/a.py/);
  assert.ok(Buffer.byteLength(context, "utf8") < MAX_RETRIEVED_TOTAL_BYTES + 500);
});
test("retrieval rejects an index belonging to another workspace", () => {
  const index = { workspaceRoot: "D:/old-workspace", lastIndexedAt: "2026-01-01", files, totalBytes: 60 };
  assert.equal(isIndexForWorkspace(index, "D:/current-workspace"), false);
  assert.equal(isIndexForWorkspace(index, "D:/old-workspace"), true);
});