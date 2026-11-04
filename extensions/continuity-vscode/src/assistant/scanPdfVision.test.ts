import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractPdfText } from "./pdfText";
import { runScannedPdfReview, SCAN_TRANSCRIPTION_PROMPT, VISION_PICKER_GUIDANCE, type ScanPdfInput } from "./scanPdfVision";
import { checkSelectedVlm, transcribeScanWithLmStudio } from "./scanLmStudio";
import { wrapWebviewHtml } from "../sidebarViews";

const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64")}`;
const render = async () => ({ dataUrl: jpeg, width: 1200, height: 1600 });
const base = (): ScanPdfInput => ({
  pageTexts: [""], scannedPages: [1], provider: "lmstudio", model: "vision",
  checkModel: async () => ({ type: "vlm", loaded: true }), render,
  transcribe: async () => "Câu 1: Viết ứng dụng Flutter có dấu.",
  review: async text => text
});

test("scanned PDF fixture reaches editable confirmation before model context", async () => {
  const pdf = await extractPdfText(join("test-fixtures", "scanned.pdf"), { pdftotextPath: "" });
  assert.deepEqual(pdf.scannedPages, [1]);
  let reviewDraft = "";
  const result = await runScannedPdfReview({ ...base(), pageTexts: pdf.pageTexts, scannedPages: pdf.scannedPages, review: async text => { reviewDraft = text; return text.replace("Flutter", "Flutter sửa tay"); } });
  assert.match(reviewDraft, /\[Trang 1\]/);
  assert.match(result!, /Flutter sửa tay có dấu/);
  assert.equal(await runScannedPdfReview({ ...base(), review: async () => undefined }), undefined);
});

test("unsupported provider or non-VLM model never renders a page", async () => {
  let renders = 0;
  const renderSpy = async () => { renders++; return render(); };
  await assert.rejects(runScannedPdfReview({ ...base(), provider: "ollama", render: renderSpy }), new RegExp(VISION_PICKER_GUIDANCE.slice(0, 20)));
  await assert.rejects(runScannedPdfReview({ ...base(), checkModel: async () => ({ type: "llm", loaded: true }), render: renderSpy }), /Select Local Provider and Model/);
  await assert.rejects(runScannedPdfReview({ ...base(), checkModel: async () => ({ type: "vlm", loaded: false }), render: renderSpy }), /Select Local Provider and Model/);
  await assert.rejects(runScannedPdfReview({ ...base(), checkModel: async () => { throw new Error("API unavailable"); }, render: renderSpy }), /Select Local Provider and Model/);
  assert.equal(renders, 0);
});

test("scan page, edge, JPEG size, timeout and empty-response limits are explicit", async () => {
  await assert.rejects(runScannedPdfReview({ ...base(), pageTexts: ["", "", "", ""], scannedPages: [1, 2, 3, 4] }), /tối đa 3/);
  const oversized = await runScannedPdfReview({ ...base(), render: async () => ({ dataUrl: jpeg, width: 1601, height: 200 }) });
  assert.match(oversized!, /Không đọc được: Kích thước/);
  const largeJpeg = `data:image/jpeg;base64,${Buffer.alloc(2_000_001).toString("base64")}`;
  const overBytes = await runScannedPdfReview({ ...base(), render: async () => ({ dataUrl: largeJpeg, width: 10, height: 10 }) });
  assert.match(overBytes!, /Không đọc được: Ảnh trang scan vượt giới hạn 2 MB/);
  const empty = await runScannedPdfReview({ ...base(), transcribe: async () => "" });
  assert.match(empty!, /Không đọc được: model trả về rỗng/);
  const tooLong = await runScannedPdfReview({ ...base(), transcribe: async () => "x".repeat(10_001) });
  assert.match(tooLong!, /Không đọc được: bản chép vượt giới hạn/);
  const timed = await runScannedPdfReview({ ...base(), pageTimeoutMs: 20, render: async () => new Promise(() => {}) });
  assert.match(timed!, /Không đọc được: quá thời gian/);
});

test("cancelling an in-flight page prevents review and sending", async () => {
  const controller = new AbortController();
  let reviewed = false;
  const pending = runScannedPdfReview({ ...base(), signal: controller.signal, render: async () => new Promise(() => {}), review: async text => { reviewed = true; return text; } });
  setTimeout(() => controller.abort(), 15);
  assert.equal(await pending, undefined);
  assert.equal(reviewed, false);
});

test("LM Studio v0 eligibility and transcription request stay local and verbatim", async () => {
  const signal = new AbortController().signal;
  const fetchStub = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    assert.match(url, /^http:\/\/127\.0\.0\.1:1234\//);
    if (url.endsWith("/api/v0/models")) return new Response(JSON.stringify({ data: [{ id: "vision", type: "vlm", state: "loaded" }] }), { status: 200 });
    const request = JSON.parse(String(init?.body));
    assert.equal(request.model, "vision");
    assert.equal(request.messages[0].content[0].text, SCAN_TRANSCRIPTION_PROMPT);
    assert.match(request.messages[0].content[1].image_url.url, /^data:image\/jpeg;base64,/);
    return new Response(JSON.stringify({ choices: [{ message: { content: "Đề thi có dấu" } }] }), { status: 200 });
  };
  assert.deepEqual(await checkSelectedVlm("http://127.0.0.1:1234", "vision", signal, fetchStub), { type: "vlm", loaded: true });
  assert.equal(await transcribeScanWithLmStudio("http://127.0.0.1:1234", "vision", jpeg, signal, fetchStub), "Đề thi có dấu");
  assert.match(SCAN_TRANSCRIPTION_PROMPT, /Không giải bài, không thêm code/);
});

test("chat CSP keeps a nonce and only exposes bundled vendor resources for PDF rendering", () => {
  const html = wrapWebviewHtml("Chat", '<script type="module">import("vendor");</script>', "vscode-webview-resource:");
  assert.match(html, /script type="module" nonce="[a-f0-9-]+"/);
  assert.match(html, /worker-src vscode-webview-resource: blob:/);
  const source = readFileSync("src/extension.ts", "utf8");
  assert.match(source, /"dist", "vendor", "pdfjs"/);
  const sidebar = readFileSync("src/sidebarViews.ts", "utf8");
  assert.match(sidebar, /localResourceRoots: \[assets\.vendorRoot\]/);
  assert.match(sidebar, /canvas\.toDataURL\('image\/jpeg', 0\.80\)/);
});
