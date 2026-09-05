import { createOllamaSummaryPayload } from "./timeline";
import type { ContinuityState } from "./timeline";

export type ProviderId = "ollama" | "openai";
export const OLLAMA_URL = "http://127.0.0.1:11434/api/generate";
export const OPENAI_URL = "https://api.openai.com/v1/responses";

export function buildOpenAIRequest(state: ContinuityState | undefined, model: string) {
  return { model, store: false, tools: [], input: `Summarize this bounded Continuity workflow snapshot. Do not infer missing information.\n${createOllamaSummaryPayload(state)}` };
}

export async function requestOllama(state: ContinuityState | undefined, model: string): Promise<string> {
  const response = await fetch(OLLAMA_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, stream: false, prompt: buildOpenAIRequest(state, model).input }) });
  if (!response.ok) throw new Error(`Ollama returned ${response.status}.`);
  return ((await response.json()) as { response?: string }).response?.trim() || "Ollama returned no summary.";
}

export async function requestOpenAI(state: ContinuityState | undefined, model: string, apiKey: string): Promise<string> {
  const response = await fetch(OPENAI_URL, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` }, body: JSON.stringify(buildOpenAIRequest(state, model)) });
  if (!response.ok) throw new Error(`OpenAI returned ${response.status}.`);
  const body = await response.json() as { output_text?: string };
  return body.output_text?.trim() || "OpenAI returned no summary.";
}
