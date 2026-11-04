export const SCAN_MAX_PAGES = 3;
export const SCAN_MAX_EDGE = 1600;
export const SCAN_JPEG_QUALITY = 0.80;
export const SCAN_MAX_IMAGE_BYTES = 2_000_000;
export const SCAN_PAGE_TIMEOUT_MS = 90_000;
export const SCAN_MAX_TRANSCRIPT_CHARS = 10_000;
export const SCAN_MAX_CONTEXT_CHARS = 40_000;
export const SCAN_TRANSCRIPTION_PROMPT = "Chỉ chép nguyên văn toàn bộ chữ nhìn thấy trên trang này. Giữ nguyên tiếng Việt có dấu, thứ tự dòng, ký hiệu và số. Không giải bài, không thêm code, không suy đoán chữ không đọc được. Nếu không đọc được, trả về chuỗi rỗng.";
export const VISION_PICKER_GUIDANCE = "Model hiện tại không đọc được ảnh PDF. Hãy dùng lệnh Assistant: Select Local Provider and Model để chọn một model LM Studio VLM đã nạp.";

export interface RenderedScanPage { dataUrl: string; width: number; height: number; }
export interface ScanPdfInput {
  pageTexts: string[];
  scannedPages: number[];
  provider: string;
  model: string;
  checkModel: (model: string, signal: AbortSignal) => Promise<{ type: string; loaded: boolean }>;
  render: (page: number, signal: AbortSignal) => Promise<RenderedScanPage>;
  transcribe: (page: number, dataUrl: string, signal: AbortSignal) => Promise<string>;
  review: (draft: string) => Promise<string | undefined>;
  signal?: AbortSignal;
  pageTimeoutMs?: number;
}

function assertImage(image: RenderedScanPage): void {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1 || Math.max(image.width, image.height) > SCAN_MAX_EDGE) throw new Error("Kích thước trang scan vượt giới hạn 1600 px.");
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(image.dataUrl);
  if (!match) throw new Error("Trang scan phải là ảnh JPEG base64.");
  const bytes = Buffer.from(match[1], "base64").byteLength;
  if (bytes > SCAN_MAX_IMAGE_BYTES) throw new Error("Ảnh trang scan vượt giới hạn 2 MB.");
}

function cancelled(signal?: AbortSignal): boolean { return signal?.aborted === true; }

function untilAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error("quá thời gian hoặc đã hủy"));
  return new Promise<T>((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(new Error("quá thời gian hoặc đã hủy")); };
    signal.addEventListener("abort", abort, { once: true });
    work.then(value => { signal.removeEventListener("abort", abort); resolve(value); }, error => { signal.removeEventListener("abort", abort); reject(error); });
  });
}

export async function runScannedPdfReview(input: ScanPdfInput): Promise<string | undefined> {
  if (input.scannedPages.length > SCAN_MAX_PAGES) throw new Error(`PDF có ${input.scannedPages.length} trang scan; tối đa ${SCAN_MAX_PAGES} trang mỗi lần.`);
  if (!input.scannedPages.length) throw new Error("PDF không có trang scan cần đọc.");
  if (input.provider !== "lmstudio" || !input.model.trim()) throw new Error(VISION_PICKER_GUIDANCE);
  if (cancelled(input.signal)) return undefined;
  const parent = input.signal ?? new AbortController().signal;
  let capability: { type: string; loaded: boolean };
  try { capability = await input.checkModel(input.model, parent); }
  catch (error) { if (cancelled(input.signal)) return undefined; throw new Error(`${error instanceof Error ? error.message : String(error)} ${VISION_PICKER_GUIDANCE}`); }
  if (cancelled(input.signal)) return undefined;
  if (capability.type !== "vlm" || !capability.loaded) throw new Error(VISION_PICKER_GUIDANCE);
  const scanTexts = new Map<number, string>();
  for (const page of input.scannedPages) {
    if (cancelled(input.signal)) return undefined;
    if (!Number.isInteger(page) || page < 1 || page > input.pageTexts.length) throw new Error("Chỉ số trang scan không hợp lệ.");
    const controller = new AbortController();
    const abort = () => controller.abort();
    parent.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, input.pageTimeoutMs ?? SCAN_PAGE_TIMEOUT_MS);
    try {
      const image = await untilAbort(input.render(page, controller.signal), controller.signal);
      if (controller.signal.aborted) throw new Error("quá thời gian");
      assertImage(image);
      const text = (await untilAbort(input.transcribe(page, image.dataUrl, controller.signal), controller.signal)).trim();
      if (controller.signal.aborted) throw new Error("quá thời gian");
      scanTexts.set(page, !text ? "[Không đọc được: model trả về rỗng]" : text.length > SCAN_MAX_TRANSCRIPT_CHARS ? "[Không đọc được: bản chép vượt giới hạn 10.000 ký tự]" : text);
    } catch (error) {
      if (cancelled(input.signal)) return undefined;
      scanTexts.set(page, `[Không đọc được: ${error instanceof Error ? error.message.slice(0, 200) : "lỗi không xác định"}]`);
    } finally {
      clearTimeout(timeout);
      parent.removeEventListener("abort", abort);
      controller.abort();
    }
  }
  const draft = input.pageTexts.map((text, index) => `[Trang ${index + 1}]\n${scanTexts.get(index + 1) ?? text}`).join("\n\n");
  if (draft.length > SCAN_MAX_CONTEXT_CHARS) throw new Error("Nội dung PDF vượt giới hạn 40.000 ký tự; không gửi bản bị cắt âm thầm.");
  if (cancelled(input.signal)) return undefined;
  const confirmed = await input.review(draft);
  if (confirmed === undefined || cancelled(input.signal)) return undefined;
  if (!confirmed.trim()) throw new Error("Bản chép đã xác nhận trống.");
  if (confirmed.length > SCAN_MAX_CONTEXT_CHARS) throw new Error("Bản chép đã xác nhận vượt 40.000 ký tự.");
  return confirmed;
}
