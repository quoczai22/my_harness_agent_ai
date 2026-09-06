import * as vscode from "vscode";
import { isIgnoredPath, MAX_FILE_SIZE_BYTES, MAX_CONTEXT_BYTES, WorkspaceFileEntry } from "./assistant";

export interface ReadWorkspaceResult {
  files: WorkspaceFileEntry[];
  totalBytes: number;
  truncated: boolean;
  ignoredCount: number;
}

/**
 * Reads and bounds files strictly from the active VS Code workspace folder.
 */
export async function readActiveWorkspaceContext(
  folder: vscode.WorkspaceFolder | undefined,
  maxFileSize: number = MAX_FILE_SIZE_BYTES,
  maxTotalBudget: number = MAX_CONTEXT_BYTES
): Promise<ReadWorkspaceResult> {
  if (!folder) {
    return { files: [], totalBytes: 0, truncated: false, ignoredCount: 0 };
  }

  const result: WorkspaceFileEntry[] = [];
  let totalBytes = 0;
  let truncated = false;
  let ignoredCount = 0;

  // Search exclusively inside the workspace folder with exclusion patterns
  const uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folder, "**/*"),
    "{**/.git/**,**/node_modules/**,**/dist/**,**/build/**,**/.env*}",
    500
  );

  for (const uri of uris) {
    const relPath = vscode.workspace.asRelativePath(uri, false);
    if (isIgnoredPath(relPath)) {
      ignoredCount++;
      continue;
    }

    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > maxFileSize) {
        ignoredCount++;
        continue;
      }

      if (totalBytes + stat.size > maxTotalBudget) {
        truncated = true;
        break;
      }

      const raw = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(raw).toString("utf8");

      result.push({
        path: relPath,
        content: text,
        sizeBytes: stat.size
      });
      totalBytes += stat.size;
    } catch {
      // Ignore unreadable or locked files defensively
      ignoredCount++;
    }
  }

  return {
    files: result,
    totalBytes,
    truncated,
    ignoredCount
  };
}
