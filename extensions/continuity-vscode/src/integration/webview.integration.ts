import * as vscode from "vscode";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { checkSelectedVlm, transcribeScanWithLmStudio } from "../assistant/scanLmStudio";
import type { RenderedScanPage } from "../assistant/scanPdfVision";

interface TestApi {
  waitForChatWebview(timeoutMs?: number): Promise<void>;
  renderPdfPageForTest(bytes: Uint8Array, page: number, signal: AbortSignal): Promise<RenderedScanPage>;
}

function jpegDimensions(bytes: Buffer): { width: number; height: number } {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new Error("Not a complete JPEG.");
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error("Invalid JPEG marker.");
    const marker = bytes[offset + 1];
    if (marker === 0xd9) break;
    const segmentLength = bytes.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) throw new Error("Invalid JPEG segment.");
    if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    offset += 2 + segmentLength;
  }
  throw new Error("JPEG has no decodable image dimensions.");
}

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension<TestApi>("quoczai22.continuity-vscode");
  if (!extension) throw new Error("Development extension is not installed in isolated VS Code.");
  const api = await extension.activate();
  if (!api?.waitForChatWebview || !api?.renderPdfPageForTest) throw new Error("Test-only activation API is unavailable.");
  await vscode.commands.executeCommand("workbench.view.extension.continuity");
  await vscode.commands.executeCommand("continuity.assistant.chat.focus");
  await api.waitForChatWebview(20_000);
  const fixture = await readFile(join(extension.extensionPath, "test-fixtures", "scanned.pdf"));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let image: RenderedScanPage;
  try { image = await api.renderPdfPageForTest(fixture, 1, controller.signal); }
  finally { clearTimeout(timeout); }
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(image.dataUrl);
  if (!match) throw new Error("Render did not return base64 JPEG.");
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length > 2_000_000) throw new Error(`JPEG exceeds 2 MB: ${bytes.length}`);
  const dimensions = jpegDimensions(bytes);
  if (dimensions.width !== image.width || dimensions.height !== image.height || Math.max(dimensions.width, dimensions.height) > 1600) throw new Error(`Invalid JPEG dimensions: ${JSON.stringify(dimensions)}`);
  const diagnostics = image.testDiagnostics;
  if (!diagnostics || diagnostics.sampledPixels < 1 || diagnostics.nonwhitePixels < 1) throw new Error(`Blank or unmeasured rendered page: ${JSON.stringify(diagnostics)}`);
  console.log(`WEBVIEW PASS: JPEG ${dimensions.width}x${dimensions.height}, ${bytes.length} bytes, nonwhite ${diagnostics.nonwhitePixels}/${diagnostics.sampledPixels}, pdf.js worker=${diagnostics.worker}`);

  const endpoint = "http://127.0.0.1:1234/v1";
  let models: { data?: Array<{ id?: string; type?: string; state?: string }> };
  try {
    const response = await fetch("http://127.0.0.1:1234/api/v0/models", { signal: AbortSignal.timeout(3_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    models = await response.json() as { data?: Array<{ id?: string; type?: string; state?: string }> };
  } catch (error) {
    console.log(`VLM SKIP: LM Studio unavailable: ${error}`);
    return;
  }
  const vlm = models.data?.find(item => item.type === "vlm" && item.state === "loaded" && item.id);
  if (!vlm?.id) { console.log("VLM SKIP: LM Studio has no loaded VLM."); return; }
  const signal = AbortSignal.timeout(30_000);
  const capability = await checkSelectedVlm(endpoint, vlm.id, signal);
  if (!capability.loaded || capability.type !== "vlm") throw new Error("Selected VLM changed state.");
  const transcript = await transcribeScanWithLmStudio(endpoint, vlm.id, image.dataUrl, signal);
  console.log(`VLM TRANSCRIPT (${vlm.id}): ${transcript}`);
}
