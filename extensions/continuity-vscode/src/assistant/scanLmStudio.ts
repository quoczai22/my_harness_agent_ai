import { validateLmStudioEndpoint } from "../lmStudioClient";
import { SCAN_TRANSCRIPTION_PROMPT } from "./scanPdfVision";

export async function checkSelectedVlm(endpoint: string, model: string, signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<{ type: string; loaded: boolean }> {
  const base = validateLmStudioEndpoint(endpoint).replace(/\/v1$/, "");
  const response = await fetchImpl(`${base}/api/v0/models`, { signal: AbortSignal.any([signal, AbortSignal.timeout(3_000)]), redirect: "error" });
  if (!response.ok) throw new Error(`Không xác minh được model đọc ảnh LM Studio (HTTP ${response.status}).`);
  const body = await response.json() as { data?: Array<{ id?: unknown; type?: unknown; state?: unknown }> };
  if (!Array.isArray(body.data)) throw new Error("LM Studio không trả về danh sách type/state của model.");
  const selected = body.data.find(item => item.id === model);
  return { type: typeof selected?.type === "string" ? selected.type : "", loaded: selected?.state === "loaded" };
}

export async function transcribeScanWithLmStudio(endpoint: string, model: string, imageDataUrl: string, signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<string> {
  const base = validateLmStudioEndpoint(endpoint);
  const response = await fetchImpl(`${base}/chat/completions`, {
    method: "POST", redirect: "error", signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, stream: false, messages: [{ role: "user", content: [
      { type: "text", text: SCAN_TRANSCRIPTION_PROMPT },
      { type: "image_url", image_url: { url: imageDataUrl } }
    ] }] })
  });
  if (!response.ok) throw new Error(`LM Studio không chép được trang scan (HTTP ${response.status}).`);
  const body = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  return typeof body.choices?.[0]?.message?.content === "string" ? body.choices[0].message.content : "";
}
