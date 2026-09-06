import * as vscode from "vscode";
import { lstat, realpath } from "node:fs/promises";
import * as path from "node:path";
import { isContained, isIgnoredRelativePath, limitUtf8, MAX_CONTEXT_BYTES, MAX_FILE_BYTES, MAX_SELECTION_BYTES } from "./guards";
export { MAX_CONTEXT_BYTES, MAX_FILE_BYTES, MAX_SELECTION_BYTES, isIgnoredRelativePath } from "./guards";

export async function isSafeWorkspaceUri(uri: vscode.Uri, folder = vscode.workspace.getWorkspaceFolder(uri)): Promise<boolean> {
  if (!folder || uri.scheme !== "file" || folder.uri.scheme !== "file") return false;
  const root = await realpath(folder.uri.fsPath);
  const candidate = path.resolve(uri.fsPath);
  const relative = path.relative(root, candidate);
  if (!isContained(root, candidate)) return false;
  try {
    // Reject links/reparse points rather than following them. This keeps apply targets inside the opened workspace.
    const linkInfo = await lstat(candidate);
    if (!linkInfo.isFile() || linkInfo.isSymbolicLink() || linkInfo.size > MAX_FILE_BYTES) return false;
    const resolved = await realpath(candidate);
    const resolvedRelative = path.relative(root, resolved);
    return isContained(root, resolved);
  } catch { return false; }
}

export async function readSafeFile(uri: vscode.Uri): Promise<string> {
  if (!await isSafeWorkspaceUri(uri)) throw new Error("That file is outside the safe offline assistant boundary.");
  const data = await vscode.workspace.fs.readFile(uri);
  if (data.byteLength > MAX_FILE_BYTES || data.includes(0)) throw new Error("That file is too large or binary.");
  return new TextDecoder("utf-8", { fatal: true }).decode(data);
}

export async function activeEditorContext(selectionOnly = false): Promise<{ uri: vscode.Uri; language: string; text: string; label: string }> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) throw new Error("Open a workspace file before asking the offline assistant.");
  if (!await isSafeWorkspaceUri(editor.document.uri)) throw new Error("The active file is ignored, linked, or outside the opened workspace.");
  const selected = !editor.selection.isEmpty;
  const source = selected ? editor.document.getText(editor.selection) : await readSafeFile(editor.document.uri);
  const limited = limitUtf8(source, selected ? MAX_SELECTION_BYTES : MAX_CONTEXT_BYTES);
  return { uri: editor.document.uri, language: editor.document.languageId, text: limited, label: selected ? "selection" : "file" };
}

export async function styleSample(): Promise<string[]> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const files = await vscode.workspace.findFiles("**/*", "{**/.git/**,**/node_modules/**,**/dist/**,**/.env*,**/*.png,**/*.jpg,**/*.pdf}", 12);
  const samples: string[] = [];
  for (const file of files) {
    if (folders.length && !await isSafeWorkspaceUri(file)) continue;
    try { samples.push(await readSafeFile(file)); } catch { /* ignored by design */ }
  }
  return samples;
}
