import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import { DEFAULT_LM_STUDIO_URL, validateLmStudioEndpoint } from "../lmStudioClient";
import { OLLAMA_TAGS_URL } from "../ollamaClient";

export type LocalProvider = "ollama" | "lmstudio";
export interface AvailableModel { id: string; vision: boolean; loaded: boolean | undefined; }
export interface PickedModel { provider: LocalProvider; model: string; }
export type LocalSettingKey = "offlineAssistantProvider" | "offlineAssistantModel" | "lmStudioModel";
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type RunLike = (command: string, args: string[], timeoutMs: number) => Promise<void>;

const execFileAsync = promisify(nodeExecFile);
const runLocalCli: RunLike = async (command, args, timeoutMs) => {
  await execFileAsync(command, args, { shell: false, windowsHide: true, timeout: timeoutMs, maxBuffer: 100_000 });
};

function localBase(endpoint: string): { base: string; port: string } {
  const url = new URL(validateLmStudioEndpoint(endpoint));
  if (url.hostname !== "127.0.0.1") throw new Error("LM Studio picker requires a 127.0.0.1 endpoint.");
  return { base: url.origin, port: url.port || "80" };
}

async function getJson(url: string, fetchImpl: FetchLike): Promise<Response> {
  return fetchImpl(url, { signal: AbortSignal.timeout(3_000), redirect: "error" });
}

export async function listOllamaModels(fetchImpl: FetchLike = fetch): Promise<AvailableModel[]> {
  const response = await getJson(OLLAMA_TAGS_URL, fetchImpl);
  if (!response.ok) throw new Error(`Ollama model list failed (HTTP ${response.status}).`);
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !Array.isArray((body as any).models)) throw new Error("Ollama returned an invalid model list.");
  const names: string[] = (body as { models: Array<{ name?: unknown }> }).models
    .map(item => item?.name).filter((id): id is string => typeof id === "string" && !!id.trim());
  return [...new Set(names)]
    .map(id => ({ id, vision: false, loaded: true }));
}

export async function listLmStudioModels(endpoint = DEFAULT_LM_STUDIO_URL, fetchImpl: FetchLike = fetch): Promise<AvailableModel[]> {
  const { base } = localBase(endpoint);
  const v0 = await getJson(`${base}/api/v0/models`, fetchImpl);
  if (v0.ok) {
    const body: unknown = await v0.json();
    if (!body || typeof body !== "object" || !Array.isArray((body as any).data)) throw new Error("LM Studio returned an invalid v0 model list.");
    return (body as any).data
      .filter((item: any) => (item?.type === "llm" || item?.type === "vlm") && typeof item.id === "string" && !!item.id.trim())
      .map((item: any) => ({ id: item.id as string, vision: item.type === "vlm", loaded: item.state === "loaded" }));
  }
  if (![404, 405, 501].includes(v0.status)) throw new Error(`LM Studio model list failed (HTTP ${v0.status}).`);
  const fallback = await getJson(`${base}/v1/models`, fetchImpl);
  if (!fallback.ok) throw new Error(`LM Studio fallback model list failed (HTTP ${fallback.status}).`);
  const body: unknown = await fallback.json();
  if (!body || typeof body !== "object" || !Array.isArray((body as any).data)) throw new Error("LM Studio returned an invalid fallback model list.");
  return (body as any).data
    .filter((item: any) => typeof item?.id === "string" && !!item.id.trim())
    .map((item: any) => ({ id: item.id as string, vision: false, loaded: undefined }));
}

export async function ensureLmStudioServer(endpoint = DEFAULT_LM_STUDIO_URL, deps: { fetchImpl?: FetchLike; run?: RunLike; sleep?: (ms: number) => Promise<void> } = {}): Promise<void> {
  const { base, port } = localBase(endpoint);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const ready = async () => {
    try {
      const v0 = await getJson(`${base}/api/v0/models`, fetchImpl);
      return v0.ok || ([404, 405, 501].includes(v0.status) && (await getJson(`${base}/v1/models`, fetchImpl)).ok);
    } catch { return false; }
  };
  if (await ready()) return;
  try { await (deps.run ?? runLocalCli)("lms", ["server", "start", "--bind", "127.0.0.1", "--port", port], 15_000); }
  catch (error) { throw new Error(`Could not start local LM Studio server: ${error instanceof Error ? error.message : String(error)}`); }
  const sleep = deps.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  for (let i = 0; i < 20; i++) { if (await ready()) return; await sleep(500); }
  throw new Error("LM Studio server did not become ready on 127.0.0.1 within 10 seconds.");
}

export async function ensureLmStudioModelLoaded(model: AvailableModel, endpoint = DEFAULT_LM_STUDIO_URL, deps: { fetchImpl?: FetchLike; run?: RunLike; sleep?: (ms: number) => Promise<void> } = {}): Promise<void> {
  if (model.loaded === true) return;
  const { base } = localBase(endpoint);
  const fetchImpl = deps.fetchImpl ?? fetch;
  if (model.loaded === undefined) {
    const loaded = await getJson(`${base}/v1/models`, fetchImpl);
    if (!loaded.ok) throw new Error(`Cannot check loaded LM Studio models (HTTP ${loaded.status}).`);
    const body: unknown = await loaded.json();
    if (Array.isArray((body as any)?.data) && (body as any).data.some((item: any) => item?.id === model.id)) return;
  }
  try { await (deps.run ?? runLocalCli)("lms", ["load", model.id], 120_000); }
  catch (error) { throw new Error(`Could not load LM Studio model ${model.id}: ${error instanceof Error ? error.message : String(error)}`); }
  const sleep = deps.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  for (let i = 0; i < 20; i++) {
    try {
      const response = await getJson(`${base}/v1/models`, fetchImpl);
      if (response.ok) {
        const body: unknown = await response.json();
        if (Array.isArray((body as any)?.data) && (body as any).data.some((item: any) => item?.id === model.id)) return;
      }
    } catch { /* keep polling until the bounded deadline */ }
    await sleep(500);
  }
  throw new Error(`LM Studio did not report ${model.id} as loaded within 10 seconds.`);
}

/** Keep configuration writes after all discovery and loading steps succeed. */
export async function chooseLocalModel(deps: {
  pickProvider: () => Promise<LocalProvider | undefined>;
  pickModel: (models: AvailableModel[]) => Promise<AvailableModel | undefined>;
  list: (provider: LocalProvider) => Promise<AvailableModel[]>;
  prepare: (provider: LocalProvider, model: AvailableModel) => Promise<void>;
  save: (choice: PickedModel) => Promise<void>;
}): Promise<PickedModel | undefined> {
  const provider = await deps.pickProvider();
  if (!provider) return;
  const models = await deps.list(provider);
  if (!models.length) throw new Error(`${provider === "lmstudio" ? "LM Studio" : "Ollama"} reports no usable local models.`);
  const model = await deps.pickModel(models);
  if (!model) return;
  await deps.prepare(provider, model);
  const choice = { provider, model: model.id };
  await deps.save(choice);
  return choice;
}

export async function persistLocalModelChoice(choice: PickedModel, deps: {
  read: (key: LocalSettingKey) => string;
  write: (key: LocalSettingKey, value: string) => Promise<void>;
}): Promise<void> {
  const modelKey = choice.provider === "lmstudio" ? "lmStudioModel" : "offlineAssistantModel";
  const oldProvider = deps.read("offlineAssistantProvider");
  const oldModel = deps.read(modelKey);
  try {
    await deps.write(modelKey, choice.model);
    await deps.write("offlineAssistantProvider", choice.provider);
  } catch (error) {
    try { await deps.write(modelKey, oldModel); await deps.write("offlineAssistantProvider", oldProvider); }
    catch { throw new Error("Could not save or restore local model settings. Check Continuity Settings manually.", { cause: error }); }
    throw error;
  }
}
