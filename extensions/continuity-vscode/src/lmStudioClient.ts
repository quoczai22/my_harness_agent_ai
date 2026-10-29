/** Local-only LM Studio adapter. Harness retains sessions and tool permissions. */
export const DEFAULT_LM_STUDIO_URL = "http://127.0.0.1:1234";

export function validateLmStudioEndpoint(value: string): string {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("Invalid LM Studio endpoint."); }
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)
      || parsed.username || parsed.password || parsed.search || parsed.hash || !["", "/", "/v1", "/v1/"].includes(parsed.pathname)) {
    throw new Error("LM Studio endpoint must be an HTTP loopback URL with no credentials or query.");
  }
  return `${parsed.origin}/v1`;
}

export interface LmStudioModel { id: string; }

export async function listLocalLmStudioModels(endpoint = DEFAULT_LM_STUDIO_URL): Promise<LmStudioModel[]> {
  const base = validateLmStudioEndpoint(endpoint);
  const response = await fetch(`${base}/models`, { signal: AbortSignal.timeout(3_000), redirect: "error" });
  if (!response.ok) throw new Error(`LM Studio returned HTTP ${response.status} while listing models.`);
  const body = await response.json() as { data?: Array<{ id?: unknown }> };
  return Array.isArray(body.data) ? body.data.filter((item): item is { id: string } => typeof item?.id === "string" && !!item.id) : [];
}

export async function queryLocalLmStudio(prompt: string, options: {
  endpoint?: string; model: string; systemPrompt?: string; timeoutMs?: number; imageDataUrl?: string;
}): Promise<string> {
  const base = validateLmStudioEndpoint(options.endpoint ?? DEFAULT_LM_STUDIO_URL);
  const model = options.model.trim();
  if (!model) throw new Error("Select a loaded LM Studio model in Continuity settings.");
  const timeoutMs = options.timeoutMs ?? 90_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 900_000) throw new Error("Invalid LM Studio timeout.");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(timeoutMs), redirect: "error",
    body: JSON.stringify({ model, stream: false, messages: [
      ...(options.systemPrompt ? [{ role: "system", content: options.systemPrompt }] : []),
      { role: "user", content: options.imageDataUrl ? [
        { type: "text", text: prompt }, { type: "image_url", image_url: { url: options.imageDataUrl } }
      ] : prompt }
    ] })
  });
  if (!response.ok) throw new Error(`LM Studio returned HTTP ${response.status}: ${response.statusText}`);
  const body = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("LM Studio returned no text response. Check the loaded model and its chat template.");
  return content;
}
