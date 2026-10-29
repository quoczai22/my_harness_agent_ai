import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extname } from "node:path";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import * as vscode from "vscode";

const execFileAsync = promisify(execFile);
export interface LocalAttachment { text: string; imageDataUrl?: string; }

async function safeAttachmentFile(uri: vscode.Uri, folder: vscode.WorkspaceFolder): Promise<boolean> {
  if (uri.scheme !== "file" || folder.uri.scheme !== "file") return false;
  const root = await realpath(folder.uri.fsPath);
  const candidate = resolve(uri.fsPath);
  const inside = (path: string) => { const rel = relative(root, path); return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel); };
  if (!inside(candidate)) return false;
  try {
    const info = await lstat(candidate);
    return info.isFile() && !info.isSymbolicLink() && inside(await realpath(candidate));
  } catch { return false; }
}

/** Chat syntax: /pdf relative/path.pdf | question, or /image relative/path.png | question */
export async function readLocalAttachment(
  input: string, folder: vscode.WorkspaceFolder | undefined, pdfTextExecutable: string
): Promise<LocalAttachment> {
  const match = input.match(/^\/(pdf|image)\s+([^\r\n]+)$/i);
  if (!match) return { text: input };
  if (!folder) throw new Error("Open a project folder before attaching a file.");
  const kind = match[1].toLowerCase();
  const [pathPart, ...questionParts] = match[2].split("|");
  const relativePath = pathPart.trim().replace(/\\/g, "/");
  const question = questionParts.join("|").trim();
  if (!relativePath || relativePath.startsWith("/") || /^[a-z]:/i.test(relativePath) || relativePath.split("/").includes("..")) {
    throw new Error("Attachment path must stay inside the selected project.");
  }
  const uri = vscode.Uri.joinPath(folder.uri, ...relativePath.split("/"));
  if (!await safeAttachmentFile(uri, folder)) throw new Error("Attachment is outside the safe project context.");
  const size = (await vscode.workspace.fs.stat(uri)).size;
  if (kind === "image") {
    const mime = ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" } as Record<string, string>)[extname(relativePath).toLowerCase()];
    if (!mime) throw new Error("Use a PNG, JPEG, or WebP image.");
    if (size > 2_000_000) throw new Error("Image exceeds the 2 MB local limit.");
    return { text: `${question || "Describe this project image."}\nImage: ${relativePath}`, imageDataUrl: `data:${mime};base64,${Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("base64")}` };
  }
  if (extname(relativePath).toLowerCase() !== ".pdf") throw new Error("Use a PDF file.");
  if (size > 10_000_000) throw new Error("PDF exceeds the 10 MB local limit.");
  if (!pdfTextExecutable.trim()) throw new Error("Set continuity.pdfTextExecutable to a local pdftotext executable. Scanned PDFs require a local OCR/vision workflow.");
  const { stdout } = await execFileAsync(pdfTextExecutable, ["-f", "1", "-l", "20", "-layout", "-enc", "UTF-8", uri.fsPath, "-"], {
    encoding: "utf8", timeout: 15_000, maxBuffer: 512_000, windowsHide: true
  });
  if (!stdout.trim()) throw new Error("No extractable text found in PDF. A scanned PDF needs local OCR or a vision model.");
  return { text: `${question || "Explain the relevant contents of this PDF."}\nExtracted text from ${relativePath} (first 20 pages, bounded):\n${stdout.slice(0, 40_000)}` };
}
