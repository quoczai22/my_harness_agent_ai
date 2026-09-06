import test from "node:test";
import assert from "node:assert/strict";
import { isContained, isIgnoredRelativePath, limitUtf8 } from "./guards";
import { localOllamaUrl, OLLAMA_CHAT_URL } from "./ollama";
import { parseStructuredProposal } from "../proposal";
test("blocks ignored and binary workspace paths", () => { for (const value of [".git/config", "node_modules/a.js", "dist/app.js", ".env", ".env.local", "assets/logo.png"]) assert.equal(isIgnoredRelativePath(value), true); assert.equal(isIgnoredRelativePath("src/app.ts"), false); });
test("rejects paths outside workspace and bounds context", () => { assert.equal(isContained("C:\\work", "C:\\work\\src\\app.ts"), true); assert.equal(isContained("C:\\work", "C:\\other\\secret.ts"), false); assert.match(limitUtf8("abcdef", 3), /truncated/); });
test("Ollama adapter has an immutable loopback endpoint", () => { assert.equal(localOllamaUrl(), OLLAMA_CHAT_URL); assert.throws(() => localOllamaUrl("http://example.com/api/chat"), /127.0.0.1/); });
test("rejects malformed, oversized, and incomplete proposed edits", () => { assert.throws(() => parseStructuredProposal("no"), /structured JSON/); assert.throws(() => parseStructuredProposal(JSON.stringify({ path: "src/a.ts", replacement: "x" })), /original/); assert.throws(() => parseStructuredProposal(JSON.stringify({ path: "src/a.ts", original: "x".repeat(9000), replacement: "y" })), /8 KB/); });
