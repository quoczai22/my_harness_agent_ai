import { spawn, type SpawnOptions } from "node:child_process";
import { DEFAULT_OLLAMA_HOST, DEFAULT_OLLAMA_MODEL, validateOllamaEndpoint } from "./assistant";

export const DEFAULT_OFFLINE_OLLAMA_TIMEOUT_MS = 90_000;
export const OLLAMA_TAGS_URL = "http://127.0.0.1:11434/api/tags";
export const DEFAULT_OLLAMA_STARTUP_TIMEOUT_MS = 12_000;
export const DEFAULT_OLLAMA_STARTUP_POLL_MS = 250;

let startupInFlight: Promise<void> | undefined;

type FetchLike = (input: string, init?: RequestInit) => Promise<{ ok: boolean }>;
type SpawnLike = (command: string, args: readonly string[], options: SpawnOptions) => { unref(): void };

export interface EnsureOllamaServiceOptions {
  autoStart?: boolean;
  startupTimeoutMs?: number;
  pollIntervalMs?: number;
  fetchImpl?: FetchLike;
  spawnImpl?: SpawnLike;
  sleep?: (milliseconds: number) => Promise<void>;
}

async function isServiceReady(fetchImpl: FetchLike): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_000);
  try {
    return (await fetchImpl(OLLAMA_TAGS_URL, { signal: controller.signal })).ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/** Starts only the installed loopback Ollama service; it never pulls models or contacts a remote endpoint. */
export async function ensureLocalOllamaService(options: EnsureOllamaServiceOptions = {}): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  if (await isServiceReady(fetchImpl)) return;
  if (options.autoStart === false) {
    throw new Error("Local Ollama is not running. Start Ollama manually or enable continuity.ollamaAutoStart.");
  }
  if (startupInFlight) return startupInFlight;

  const startupTimeoutMs = options.startupTimeoutMs ?? DEFAULT_OLLAMA_STARTUP_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_OLLAMA_STARTUP_POLL_MS;
  const spawnImpl = options.spawnImpl ?? spawn;
  const sleep = options.sleep ?? (milliseconds => new Promise<void>(resolve => setTimeout(resolve, milliseconds)));
  const attempt = (async () => {
    try {
      const child = spawnImpl("ollama", ["serve"], {
        detached: true,
        windowsHide: true,
        stdio: "ignore",
        shell: false
      });
      child.unref();
    } catch (error) {
      throw new Error(`Could not start local Ollama with 'ollama serve': ${error instanceof Error ? error.message : String(error)}`);
    }

    const deadline = Date.now() + startupTimeoutMs;
    while (Date.now() < deadline) {
      await sleep(pollIntervalMs);
      if (await isServiceReady(fetchImpl)) return;
    }
    throw new Error(`Local Ollama did not become ready within ${Math.ceil(startupTimeoutMs / 1000)} seconds. Confirm Ollama is installed and try 'ollama serve'.`);
  })();
  startupInFlight = attempt;
  try {
    await attempt;
  } finally {
    if (startupInFlight === attempt) startupInFlight = undefined;
  }
}

export function resolveOfflineOllamaTimeout(timeoutMs?: number): number {
  const resolved = timeoutMs ?? DEFAULT_OFFLINE_OLLAMA_TIMEOUT_MS;
  if (!Number.isFinite(resolved) || resolved <= 0) throw new Error("Ollama timeout must be a positive finite number of milliseconds.");
  return resolved;
}

export interface OllamaGenerateOptions {
  endpoint?: string;
  model?: string;
  systemPrompt?: string;
  timeoutMs?: number;
  autoStart?: boolean;
}

export interface OllamaResponse {
  response: string;
  done: boolean;
  totalDurationMs?: number;
}

/** Loopback-only Ollama client targeting qwen2.5-coder:7b with strict offline isolation. */
export async function queryOfflineOllama(prompt: string, options: OllamaGenerateOptions = {}): Promise<OllamaResponse> {
  const endpoint = options.endpoint ?? DEFAULT_OLLAMA_HOST;
  const validation = validateOllamaEndpoint(endpoint);
  if (!validation.valid || !validation.normalizedUrl) {
    throw new Error(validation.error ?? "Security violation: Invalid Ollama endpoint.");
  }
  await ensureLocalOllamaService({ autoStart: options.autoStart });

  const model = options.model?.trim() || DEFAULT_OLLAMA_MODEL;
  const timeoutMs = resolveOfflineOllamaTimeout(options.timeoutMs);
  const targetUrl = `${validation.normalizedUrl}/api/generate`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ model, prompt, system: options.systemPrompt, stream: false })
    });
    if (!response.ok) throw new Error(`Ollama request failed with HTTP ${response.status}: ${response.statusText}`);
    const json = (await response.json()) as { response?: string; done?: boolean; total_duration?: number };
    return { response: json.response ?? "", done: Boolean(json.done), totalDurationMs: json.total_duration ? Math.round(json.total_duration / 1_000_000) : undefined };
  } catch (err: any) {
    if (err?.name === "AbortError") throw new Error(`Local Ollama did not respond within ${Math.round(timeoutMs / 1000)} seconds. A cold model load can take longer; confirm Ollama is running and qwen2.5-coder:7b is installed, then try again.`);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}