import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractPdfText, findPdftotext, readAttachmentFile } from "./pdfText";

// Tests run from dist/assistant; fixtures live at the extension root.
const fixture = (name: string) => join(__dirname, "..", "..", "test-fixtures", name);
const noPdftotext = { pdftotextPath: "", pdftotext: async () => { throw new Error("not used"); } };

test("bundled pdf.js extracts Vietnamese text with diacritics and line order", async () => {
  const pdf = await extractPdfText(fixture("vi-text.pdf"), noPdftotext);
  assert.equal(pdf.engine, "pdfjs");
  assert.deepEqual(pdf.scannedPages, []);
  assert.match(pdf.text, /Câu 1: Tạo màn hình đăng nhập gồm ô email và mật khẩu\./);
  assert.match(pdf.text, /Mật khẩu tối thiểu 6 ký tự; email phải có ký tự @\./);
  assert.ok(pdf.text.indexOf("Câu 1") < pdf.text.indexOf("Câu 2"));
});

test("an image-only PDF is reported as scanned pages, never as invented text", async () => {
  const pdf = await extractPdfText(fixture("scanned.pdf"), noPdftotext);
  assert.deepEqual(pdf.scannedPages, [1]);
  assert.equal(pdf.text, "");
  await assert.rejects(() => readAttachmentFile(fixture("scanned.pdf"), "Làm câu 1", noPdftotext), /Trang 1 không có chữ/);
});

test("a corrupt PDF gives a clear error when no fallback is available", async () => {
  await assert.rejects(() => extractPdfText(fixture("corrupt.pdf"), { ...noPdftotext, pdftotextPath: "" }), /Không đọc được PDF/);
});

test("pdftotext is used only when pdf.js fails", async () => {
  const viaFallback = await extractPdfText(fixture("vi-text.pdf"), {
    pdftotextPath: "C:/tools/pdftotext.exe",
    pdfjs: async () => { throw new Error("pdf.js unavailable"); },
    pdftotext: async () => "Trang một có đủ chữ để không bị coi là ảnh scan của đề thi.\fTrang hai cũng vậy, đủ dài để được tính là có lớp chữ thật.\f"
  });
  assert.equal(viaFallback.engine, "pdftotext");
  assert.equal(viaFallback.pages, 2);
  const preferred = await extractPdfText(fixture("vi-text.pdf"), { pdftotextPath: "C:/tools/pdftotext.exe", pdftotext: async () => { throw new Error("must not run"); } });
  assert.equal(preferred.engine, "pdfjs");
});

test("page and character limits hold", async () => {
  const pages = Array.from({ length: 30 }, (_, i) => `Trang ${i + 1}: ` + "nội dung đề thi ".repeat(10));
  const pdf = await extractPdfText(fixture("vi-text.pdf"), {
    ...noPdftotext, maxChars: 500,
    pdfjs: async (_data, maxPages) => ({ pages: pages.slice(0, maxPages), totalPages: pages.length })
  });
  assert.equal(pdf.pages, 20);
  assert.equal(pdf.totalPages, 30);
  assert.ok(pdf.text.length <= 500 + 60);
  assert.match(pdf.text, /Truncated to the first 500 characters/);
});

test("pdftotext discovery prefers the setting, then PATH", () => {
  assert.equal(findPdftotext("D:/x/pdftotext.exe", ""), "D:/x/pdftotext.exe");
  const dir = mkdtempSync(join(tmpdir(), "pdftotext-"));
  try {
    writeFileSync(join(dir, "pdftotext.exe"), "");
    assert.equal(findPdftotext("", dir), join(dir, "pdftotext.exe"));
    assert.equal(findPdftotext("", join(dir, "missing")), "");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("chosen attachments: PDF text, image data URL, type and size limits", async () => {
  const pdf = await readAttachmentFile(fixture("vi-text.pdf"), "Làm câu 1", noPdftotext);
  assert.match(pdf.text, /^Làm câu 1\nExtracted text from vi-text\.pdf:/);
  assert.equal(pdf.imageDataUrl, undefined);
  const dir = mkdtempSync(join(tmpdir(), "attach-"));
  try {
    writeFileSync(join(dir, "de.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const image = await readAttachmentFile(join(dir, "de.png"), "", noPdftotext);
    assert.match(image.imageDataUrl ?? "", /^data:image\/png;base64,/);
    writeFileSync(join(dir, "notes.txt"), "x");
    await assert.rejects(() => readAttachmentFile(join(dir, "notes.txt"), "", noPdftotext), /Chỉ nhận PDF/);
    writeFileSync(join(dir, "big.pdf"), Buffer.alloc(10_000_001));
    await assert.rejects(() => readAttachmentFile(join(dir, "big.pdf"), "", noPdftotext), /10 MB/);
    writeFileSync(join(dir, "big.png"), Buffer.alloc(2_000_001));
    await assert.rejects(() => readAttachmentFile(join(dir, "big.png"), "", noPdftotext), /2 MB/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
