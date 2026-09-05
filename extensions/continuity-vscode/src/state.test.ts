import test from "node:test";
import assert from "node:assert/strict";
import { createOllamaSummaryPayload, extractTimeline } from "./timeline";

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
