export const OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat";
export const DEFAULT_CODER_MODEL = "qwen2.5-coder:7b";

export function localOllamaUrl(value?: string): string {
  if (value && value !== OLLAMA_CHAT_URL) throw new Error("Offline Assistant only permits the fixed 127.0.0.1 Ollama endpoint.");
  return OLLAMA_CHAT_URL;
}

export async function askLocalCoder(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>, model = DEFAULT_CODER_MODEL): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(localOllamaUrl(), { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify({ model, stream: false, messages }) });
    if (!response.ok) throw new Error(`Local Ollama returned ${response.status}. Make sure Ollama is running and the model is installed.`);
    const body = await response.json() as { message?: { content?: string } };
    return body.message?.content?.trim() || "Local Ollama returned an empty response.";
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Local Ollama timed out after 90 seconds. The first model load can take a while.");
    throw error;
  } finally { clearTimeout(timer); }
}
