import test from "node:test";
import assert from "node:assert/strict";
import { createOllamaSummaryPayload, extractTimeline } from "./timeline";
import { OPENAI_URL, OLLAMA_URL, buildOpenAIRequest } from "./providers";

test("timeline is deterministic, descending, and bounded", () => {
  const events = extractTimeline({ checkpoints: [{ id: "a", type: "spec_review", createdAt: "2026-01-01T00:00:00.000Z" }], decisions: [{ timestamp: "2026-01-02T00:00:00.000Z", decision: "approved" }] }, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].title, "approved");
});

test("Ollama summary payload is bounded and excludes task descriptions", () => {
  const payload = createOllamaSummaryPayload({ tasks: [{ id: "secret", description: "must not leave workspace" }], blockers: Array.from({ length: 20 }, (_, i) => `b${i}`) });
  assert.equal(payload.includes("must not leave workspace"), false);
  assert.equal(JSON.parse(payload).blockers.length, 10);
});

test("OpenAI request is tool-free, non-persistent, and bounded", () => {
  const request = buildOpenAIRequest({ tasks: [{ description: "secret source" }] }, "gpt-6-astra");
  assert.equal(request.store, false);
  assert.deepEqual(request.tools, []);
  assert.equal(request.input.includes("secret source"), false);
  assert.equal(OLLAMA_URL, "http://127.0.0.1:11434/api/generate");
  assert.equal(OPENAI_URL, "https://api.openai.com/v1/responses");
});