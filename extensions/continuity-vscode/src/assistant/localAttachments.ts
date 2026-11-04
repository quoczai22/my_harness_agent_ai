import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import * as vscode from "vscode";
import { readAttachmentFile, type FileAttachment } from "./pdfText";

export interface LocalAttachment extends FileAttachment {}

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
  const isPdf = relativePath.toLowerCase().endsWith(".pdf");
  if (kind === "pdf" && !isPdf) throw new Error("Use a PDF file.");
  if (kind === "image" && isPdf) throw new Error("Use a PNG, JPEG, or WebP image.");
  // Same limits and pdf.js/pdftotext order as the Attach button; the typed form only adds the project-path check.
  return readAttachmentFile(uri.fsPath, question, { pdftotextPath: pdfTextExecutable });
}

/** A file the user picked with the Attach button: explicit choice, so it may live outside the project. */
export function readChosenAttachment(file: string, question: string, pdfTextExecutable: string): Promise<LocalAttachment> {
  return readAttachmentFile(file, question, { pdftotextPath: pdfTextExecutable });
}
