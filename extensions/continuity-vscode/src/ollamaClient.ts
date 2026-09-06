import { DEFAULT_OLLAMA_HOST, DEFAULT_OLLAMA_MODEL, validateOllamaEndpoint } from "./assistant";

export const DEFAULT_OFFLINE_OLLAMA_TIMEOUT_MS = 90_000;

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
}

export interface OllamaResponse {
  response: string;
  done: boolean;
  totalDurationMs?: number;
}

/**
 * Loopback-only Ollama client targeting qwen2.5-coder:7b with strict offline isolation.
 */
export async function queryOfflineOllama(
  prompt: string,
  options: OllamaGenerateOptions = {}
): Promise<OllamaResponse> {
  const endpoint = options.endpoint ?? DEFAULT_OLLAMA_HOST;
  const validation = validateOllamaEndpoint(endpoint);
  if (!validation.valid || !validation.normalizedUrl) {
    throw new Error(validation.error ?? "Security violation: Invalid Ollama endpoint.");
  }

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
      body: JSON.stringify({
        model,
        prompt,
        system: options.systemPrompt,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with HTTP ${response.status}: ${response.statusText}`);
    }

    const json = (await response.json()) as { response?: string; done?: boolean; total_duration?: number };
    return {
      response: json.response ?? "",
      done: Boolean(json.done),
      totalDurationMs: json.total_duration ? Math.round(json.total_duration / 1_000_000) : undefined
    };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(`Local Ollama did not respond within ${Math.round(timeoutMs / 1000)} seconds. A cold model load can take longer; confirm Ollama is running and qwen2.5-coder:7b is installed, then try again.`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
