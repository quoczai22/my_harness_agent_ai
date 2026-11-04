import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, delimiter, extname, join, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const PDF_MAX_BYTES = 10_000_000;
export const PDF_MAX_PAGES = 20;
export const PDF_MAX_CHARS = 40_000;
export const IMAGE_MAX_BYTES = 2_000_000;
/** A page with less text than this has no usable text layer (usually a scan or photo). */
const MIN_PAGE_CHARS = 40;

export interface PdfText { text: string; pageTexts: string[]; pages: number; totalPages: number; scannedPages: number[]; engine: "pdfjs" | "pdftotext"; }
export interface PdfExtractOptions {
  maxPages?: number;
  maxChars?: number;
  pdftotextPath?: string;
  /** Test seams; production uses the bundled pdf.js and the pdftotext executable. */
  pdfjs?: (data: Uint8Array, maxPages: number) => Promise<{ pages: string[]; totalPages: number }>;
  pdftotext?: (exe: string, file: string, maxPages: number) => Promise<string>;
}

// pdf.js ships as ES modules; the build copies the minimal legacy build to dist/vendor/pdfjs.
const vendorDir = () => join(__dirname, "..", "vendor", "pdfjs");
let pdfjsModule: Promise<any> | undefined;
function loadPdfjs(): Promise<any> {
  pdfjsModule ??= import(pathToFileURL(join(vendorDir(), "pdf.min.mjs")).href).then(lib => {
    lib.GlobalWorkerOptions.workerSrc = pathToFileURL(join(vendorDir(), "pdf.worker.min.mjs")).href;
    return lib;
  });
  return pdfjsModule;
}

async function pdfjsPages(data: Uint8Array, maxPages: number): Promise<{ pages: string[]; totalPages: number }> {
  const lib = await loadPdfjs();
  const task = lib.getDocument({
    data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0,
    // pdf.js requires a trailing "/" (not the Windows separator) on this directory path.
    cMapUrl: join(vendorDir(), "cmaps").split(sep).join("/") + "/", cMapPacked: true
  });
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      let text = "", lastY: number | undefined;
      for (const item of content.items as Array<{ str?: string; hasEOL?: boolean; transform?: number[] }>) {
        if (typeof item.str !== "string") continue;
        const y = item.transform?.[5];
        // Items on a new baseline without an explicit end-of-line still start a new line.
        if (lastY !== undefined && y !== undefined && Math.abs(y - lastY) > 2 && text && !text.endsWith("\n")) text += "\n";
        text += item.str + (item.hasEOL ? "\n" : "");
        if (y !== undefined) lastY = y;
      }
      pages.push(text.trim());
    }
    return { pages, totalPages: doc.numPages };
  } finally { await task.destroy(); }
}

async function runPdftotext(exe: string, file: string, maxPages: number): Promise<string> {
  const { stdout } = await execFileAsync(exe, ["-f", "1", "-l", String(maxPages), "-layout", "-enc", "UTF-8", file, "-"], {
    encoding: "utf8", timeout: 15_000, maxBuffer: 2_000_000, windowsHide: true
  });
  return stdout;
}

/** The configured pdftotext, otherwise one found on PATH. */
export function findPdftotext(configured = "", pathValue = process.env.PATH ?? ""): string {
  if (configured.trim()) return configured.trim();
  for (const dir of pathValue.split(delimiter).filter(Boolean)) {
    for (const name of ["pdftotext.exe", "pdftotext"]) { if (existsSync(join(dir, name))) return join(dir, name); }
  }
  return "";
}

function summarize(pageTexts: string[], totalPages: number, engine: PdfText["engine"], maxChars: number): PdfText {
  const scannedPages = pageTexts.map((t, i) => (t.replace(/\s/g, "").length < MIN_PAGE_CHARS ? i + 1 : 0)).filter(Boolean);
  let text = pageTexts.map((t, i) => (scannedPages.includes(i + 1) ? "" : t)).filter(Boolean).join("\n\n");
  if (text.length > maxChars) text = text.slice(0, maxChars) + `\n[Truncated to the first ${maxChars} characters.]`;
  return { text, pageTexts, pages: pageTexts.length, totalPages, scannedPages, engine };
}

/** Reads a PDF's text layer locally: bundled pdf.js first, pdftotext as a fallback. Never touches the network. */
export async function extractPdfText(file: string, options: PdfExtractOptions = {}): Promise<PdfText> {
  const maxPages = options.maxPages ?? PDF_MAX_PAGES, maxChars = options.maxChars ?? PDF_MAX_CHARS;
  let firstError: unknown;
  try {
    const result = await (options.pdfjs ?? pdfjsPages)(new Uint8Array(await readFile(file)), maxPages);
    return summarize(result.pages, result.totalPages, "pdfjs", maxChars);
  } catch (error) { firstError = error; }
  const exe = findPdftotext(options.pdftotextPath);
  if (exe) {
    try {
      const out = await (options.pdftotext ?? runPdftotext)(exe, file, maxPages);
      const pages = out.split("\f").map(p => p.trim());
      if (pages.length > 1 && !pages.at(-1)) pages.pop();
      return summarize(pages, pages.length, "pdftotext", maxChars);
    } catch { /* report the pdf.js error below */ }
  }
  const reason = firstError instanceof Error ? firstError.message : String(firstError);
  throw new Error(`Không đọc được PDF này (file hỏng, có mật khẩu hoặc không phải PDF). / Could not read this PDF: ${reason}`);
}

export interface FileAttachment { text: string; imageDataUrl?: string; scannedPdf?: { file: string; pageTexts: string[]; scannedPages: number[] }; }

/** Builds the prompt part for one explicitly chosen PDF or image file. */
export async function readAttachmentFile(file: string, question: string, options: PdfExtractOptions = {}): Promise<FileAttachment> {
  const name = basename(file);
  const size = (await stat(file)).size;
  const ext = extname(file).toLowerCase();
  const mime = ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" } as Record<string, string>)[ext];
  if (mime) {
    if (size > IMAGE_MAX_BYTES) throw new Error("Ảnh lớn hơn 2 MB. / Image exceeds the 2 MB limit.");
    return { text: `${question || "Describe this image."}\nImage: ${name}`, imageDataUrl: `data:${mime};base64,${(await readFile(file)).toString("base64")}` };
  }
  if (ext !== ".pdf") throw new Error("Chỉ nhận PDF, PNG, JPEG hoặc WebP. / Use a PDF, PNG, JPEG or WebP file.");
  if (size > PDF_MAX_BYTES) throw new Error("PDF lớn hơn 10 MB. / PDF exceeds the 10 MB limit.");
  const pdf = await extractPdfText(file, options);
  const scanNote = pdf.scannedPages.length
    ? `Trang ${pdf.scannedPages.join(", ")} không có chữ (ảnh scan); hãy gửi các trang đó dạng ảnh. / Pages ${pdf.scannedPages.join(", ")} have no text layer; send them as images.`
    : "";
  if (!pdf.text && !pdf.scannedPages.length) throw new Error("PDF không có chữ. / The PDF contains no text.");
  const pageNote = pdf.totalPages > pdf.pages ? ` (first ${pdf.pages} of ${pdf.totalPages} pages)` : "";
  return {
    text: `${question || "Explain the relevant contents of this PDF."}\nExtracted text from ${name}${pageNote}:\n${pdf.text}${scanNote ? `\n[${scanNote}]` : ""}`,
    scannedPdf: pdf.scannedPages.length ? { file, pageTexts: pdf.pageTexts, scannedPages: pdf.scannedPages } : undefined
  };
}
