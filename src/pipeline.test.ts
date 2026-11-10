import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PIPELINE, nextStageId, validatePipeline, type PipelineDefinition } from "./pipeline.js";

const clone = (): PipelineDefinition => JSON.parse(JSON.stringify(DEFAULT_PIPELINE));

test("the default pipeline is valid", () => {
  assert.deepEqual(validatePipeline(DEFAULT_PIPELINE), []);
});

test("default pipeline loops back to Antigravity on failure and moves forward on pass", () => {
  assert.equal(nextStageId(DEFAULT_PIPELINE, "context", true), "build-ui");
  assert.equal(nextStageId(DEFAULT_PIPELINE, "build-ui", true), "test");
  assert.equal(nextStageId(DEFAULT_PIPELINE, "test", false), "build-ui");
  assert.equal(nextStageId(DEFAULT_PIPELINE, "test", true), "review");
  assert.equal(nextStageId(DEFAULT_PIPELINE, "review", false), "build-ui");
  assert.equal(nextStageId(DEFAULT_PIPELINE, "review", true), "commit");
  assert.equal(nextStageId(DEFAULT_PIPELINE, "commit", true), null);
});

test("a failure without onFail repeats the stage", () => {
  assert.equal(nextStageId(DEFAULT_PIPELINE, "build-ui", false), "build-ui");
});

test("validator rejects unknown targets, backward passes and bad endings", () => {
  const unknown = clone();
  unknown.stages[2].onFail = "nowhere";
  assert.match(validatePipeline(unknown).join(" "), /unknown stage "nowhere"/);

  const backward = clone();
  backward.stages[3].onPass = "build-ui";
  assert.match(validatePipeline(backward).join(" "), /onPass must point to a later stage/);

  const ending = clone();
  ending.stages.pop();
  assert.match(validatePipeline(ending).join(" "), /last stage must be commit or human/);
});

test("validator rejects malformed stages and limits", () => {
  const def = clone();
  def.maxRounds = 0;
  def.stages[1].agent = "gpt" as never;
  def.stages[2].command = undefined;
  def.stages[0].onFail = "build-ui";
  def.stages.push({ ...def.stages[4] });
  const errors = validatePipeline(def).join(" ");
  assert.match(errors, /maxRounds/);
  assert.match(errors, /agent must be one of/);
  assert.match(errors, /command must be build or test/);
  assert.match(errors, /context stage cannot fail/);
  assert.match(errors, /duplicate id "commit"/);
  assert.deepEqual(validatePipeline(null), ["Pipeline must be a JSON object."]);
});

test("pipelines may use documents, local models, commands and human checkpoints", () => {
  const def: PipelineDefinition = {
    id: "local-check",
    name: "Codex drafts, build, local model reviews, human approves",
    maxRounds: 2,
    stages: [
      { id: "docs", kind: "context", sources: ["docs/"] },
      { id: "draft", kind: "agent", agent: "codex", role: "implement" },
      { id: "build", kind: "command", command: "build", onFail: "draft" },
      { id: "local-review", kind: "agent", agent: "lmstudio", role: "review", onFail: "draft" },
      { id: "approve", kind: "human", onFail: "draft" },
    ],
  };
  assert.deepEqual(validatePipeline(def), []);
  assert.equal(nextStageId(def, "approve", true), null);
  assert.equal(nextStageId(def, "build", false), "draft");
});

test("local model agents cannot implement", () => {
  const def = clone();
  def.stages[1].agent = "ollama";
  assert.match(validatePipeline(def).join(" "), /ollama answers through a local HTTP API/);
});
