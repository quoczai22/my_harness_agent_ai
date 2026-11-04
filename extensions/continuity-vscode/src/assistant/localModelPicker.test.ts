import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { chooseLocalModel, ensureLmStudioModelLoaded, ensureLmStudioServer, listLmStudioModels, listOllamaModels, persistLocalModelChoice, type AvailableModel, type LocalSettingKey } from "./localModelPicker";

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

test("Ollama discovery reads local tags and rejects malformed results", async () => {
  const calls: string[] = [];
  const models = await listOllamaModels(async input => { calls.push(input); return json({ models: [{ name: "coder:7b" }, { name: "coder:7b" }, { name: "vision:2b" }] }); });
  assert.deepEqual(models.map(model => model.id), ["coder:7b", "vision:2b"]);
  assert.deepEqual(calls, ["http://127.0.0.1:11434/api/tags"]);
  await assert.rejects(listOllamaModels(async () => json({ data: [] })), /invalid model list/);
});

test("LM Studio v0 excludes embeddings, marks VLM, and preserves loaded state", async () => {
  const models = await listLmStudioModels("http://127.0.0.1:1234", async input => {
    assert.equal(input, "http://127.0.0.1:1234/api/v0/models");
    return json({ data: [
      { id: "chat", type: "llm", state: "loaded" },
      { id: "photo", type: "vlm", state: "not-loaded" },
      { id: "vector", type: "embeddings", state: "loaded" }
    ] });
  });
  assert.deepEqual(models, [
    { id: "chat", vision: false, loaded: true },
    { id: "photo", vision: true, loaded: false }
  ]);
  await assert.rejects(listLmStudioModels("http://0.0.0.0:1234", async () => json({ data: [] })), /loopback/);
});

test("LM Studio falls back to v1 only when v0 is unavailable and does not claim vision", async () => {
  const calls: string[] = [];
  const models = await listLmStudioModels(undefined, async input => {
    calls.push(input);
    return input.endsWith("/api/v0/models") ? json({}, 404) : json({ data: [{ id: "fallback" }] });
  });
  assert.deepEqual(calls, ["http://127.0.0.1:1234/api/v0/models", "http://127.0.0.1:1234/v1/models"]);
  assert.deepEqual(models, [{ id: "fallback", vision: false, loaded: undefined }]);
  await assert.rejects(listLmStudioModels(undefined, async () => json({}, 500)), /HTTP 500/);
});

test("LM Studio server starts with fixed local-only arguments and bounded readiness", async () => {
  const commands: Array<[string, string[], number]> = [];
  let ready = false;
  await ensureLmStudioServer(undefined, {
    fetchImpl: async () => ready ? json({ data: [] }) : Promise.reject(new Error("offline")),
    run: async (command, args, timeout) => { commands.push([command, args, timeout]); ready = true; },
    sleep: async () => {}
  });
  assert.deepEqual(commands, [["lms", ["server", "start", "--bind", "127.0.0.1", "--port", "1234"], 15_000]]);
  await assert.rejects(ensureLmStudioServer(undefined, { fetchImpl: async () => Promise.reject(new Error("offline")), run: async () => {}, sleep: async () => {} }), /did not become ready/);
  await assert.rejects(ensureLmStudioServer("http://localhost:1234", { fetchImpl: async () => json({ data: [] }) }), /127\.0\.0\.1/);
});

test("LM Studio load uses fixed command, timeout and verifies loaded model", async () => {
  const commands: Array<[string, string[], number]> = [];
  const model: AvailableModel = { id: "vision-model", vision: true, loaded: false };
  await ensureLmStudioModelLoaded(model, undefined, {
    run: async (command, args, timeout) => { commands.push([command, args, timeout]); },
    fetchImpl: async () => json({ data: [{ id: "vision-model" }] }), sleep: async () => {}
  });
  assert.deepEqual(commands, [["lms", ["load", "vision-model"], 120_000]]);
  await assert.rejects(ensureLmStudioModelLoaded(model, undefined, {
    run: async () => { throw new Error("out of memory"); }, fetchImpl: async () => json({ data: [] })
  }), /out of memory/);
  await assert.rejects(ensureLmStudioModelLoaded(model, undefined, {
    run: async () => {}, fetchImpl: async () => json({ data: [] }), sleep: async () => {}
  }), /did not report/);
});

test("picker cancellation, empty lists and load failure never save a selection", async () => {
  const model: AvailableModel = { id: "chat", vision: false, loaded: false };
  const saved: string[] = [];
  const base = { list: async () => [model], prepare: async () => {}, save: async (choice: { model: string }) => { saved.push(choice.model); } };
  assert.equal(await chooseLocalModel({ ...base, pickProvider: async () => undefined, pickModel: async () => model }), undefined);
  assert.equal(await chooseLocalModel({ ...base, pickProvider: async () => "lmstudio", pickModel: async () => undefined }), undefined);
  await assert.rejects(chooseLocalModel({ ...base, pickProvider: async () => "lmstudio", pickModel: async () => model, list: async () => [] }), /no usable local models/);
  await assert.rejects(chooseLocalModel({ ...base, pickProvider: async () => "lmstudio", pickModel: async () => model, prepare: async () => { throw new Error("load failed"); } }), /load failed/);
  assert.deepEqual(saved, []);
  assert.deepEqual(await chooseLocalModel({ ...base, pickProvider: async () => "ollama", pickModel: async () => model }), { provider: "ollama", model: "chat" });
  assert.deepEqual(saved, ["chat"]);
});

test("selection persists only the matching model and restores earlier settings on failure", async () => {
  const settings: Record<LocalSettingKey, string> = {
    offlineAssistantProvider: "ollama", offlineAssistantModel: "old-ollama", lmStudioModel: "old-lm"
  };
  const read = (key: LocalSettingKey) => settings[key];
  const write = async (key: LocalSettingKey, value: string) => { settings[key] = value; };
  await persistLocalModelChoice({ provider: "lmstudio", model: "new-lm" }, { read, write });
  assert.deepEqual(settings, { offlineAssistantProvider: "lmstudio", offlineAssistantModel: "old-ollama", lmStudioModel: "new-lm" });
  let failed = false;
  await assert.rejects(persistLocalModelChoice({ provider: "ollama", model: "new-ollama" }, {
    read,
    write: async (key, value) => {
      if (key === "offlineAssistantProvider" && !failed) { failed = true; throw new Error("write failed"); }
      settings[key] = value;
    }
  }), /write failed/);
  assert.deepEqual(settings, { offlineAssistantProvider: "lmstudio", offlineAssistantModel: "old-ollama", lmStudioModel: "new-lm" });
});

test("extension contributes a selector command and refreshes model status with chat", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  assert.ok(manifest.contributes.commands.some((item: { command: string }) => item.command === "continuity.assistant.selectLocalModel"));
  const source = readFileSync("src/extension.ts", "utf8");
  assert.match(source, /modelStatus\.command = "continuity\.assistant\.selectLocalModel"/);
  assert.match(source, /chatProvider\.refresh\(\);\s+refreshModelStatus\(\)/);
});
