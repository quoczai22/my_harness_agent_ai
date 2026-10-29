import type * as vscode from "vscode";
import { isIgnoredRelativePath, MAX_FILE_BYTES } from "./guards";
import type { MementoLike } from "../assistantStore";

export const MAX_INDEXED_FILES = 200;
export const MAX_TOTAL_INDEX_BYTES = 2 * 1024 * 1024; // 2 MB

export interface IndexedFileRecord {
  relativePath: string;
  mtimeMs: number;
  sizeBytes: number;
  summary: string;
  lineCount: number;
  languageId: string;
}

export interface WorkspaceIndexState {
  workspaceRoot: string;
  lastIndexedAt: string;
  files: IndexedFileRecord[];
  totalBytes: number;
}

export class WorkspaceIndexManager {
  private indexState: WorkspaceIndexState | null = null;
  private isIndexing = false;

  constructor(
    private readonly workspaceState: MementoLike,
    private readonly stateKey: string = "continuity.workspaceIndex"
  ) {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    const raw = this.workspaceState.get<WorkspaceIndexState>(this.stateKey);
    if (raw && raw.files && Array.isArray(raw.files)) {
      this.indexState = raw;
    }
  }

  private async saveToStorage() {
    if (this.indexState) {
      await this.workspaceState.update(this.stateKey, this.indexState);
    } else {
      await this.workspaceState.update(this.stateKey, undefined);
    }
  }

  getIndex(): WorkspaceIndexState | null {
    return this.indexState;
  }

  async clearIndex(): Promise<void> {
    this.indexState = null;
    await this.saveToStorage();
  }

  /**
   * Performs an opt-in, guarded incremental indexing of the workspace.
   */
  async buildIncrementalIndex(
    rootFsPath: string,
    fileScanner: () => Promise<Array<{ relativePath: string; mtimeMs: number; sizeBytes: number; content: string }>>,
    token?: { isCancellationRequested: boolean }
  ): Promise<{ indexedCount: number; skippedCount: number; totalBytes: number }> {
    if (this.isIndexing) {
      return { indexedCount: 0, skippedCount: 0, totalBytes: this.indexState?.totalBytes ?? 0 };
    }

    this.isIndexing = true;
    try {
      const existingMap = new Map<string, IndexedFileRecord>();
      if (this.indexState && this.indexState.workspaceRoot === rootFsPath) {
        for (const f of this.indexState.files) {
          existingMap.set(f.relativePath, f);
        }
      }

      const scanned = await fileScanner();

      const newFiles: IndexedFileRecord[] = [];
      let totalBytes = 0;
      let indexedCount = 0;
      let skippedCount = 0;

      for (const item of scanned) {
        if (token?.isCancellationRequested) {
          break;
        }

        const relPath = item.relativePath.replace(/\\/g, "/");
        if (isIgnoredRelativePath(relPath)) {
          skippedCount++;
          continue;
        }

        if (item.sizeBytes > MAX_FILE_BYTES || totalBytes + item.sizeBytes > MAX_TOTAL_INDEX_BYTES) {
          skippedCount++;
          continue;
        }

        const existing = existingMap.get(relPath);
        if (existing && existing.mtimeMs === item.mtimeMs && existing.sizeBytes === item.sizeBytes) {
          newFiles.push(existing);
          totalBytes += existing.sizeBytes;
          continue;
        }

        const lines = item.content.split("\n");
        const summary = lines.slice(0, 10).join(" ").slice(0, 200);

        const ext = relPath.includes(".") ? relPath.slice(relPath.lastIndexOf(".")) : "";
        const record: IndexedFileRecord = {
          relativePath: relPath,
          mtimeMs: item.mtimeMs,
          sizeBytes: item.sizeBytes,
          summary,
          lineCount: lines.length,
          languageId: ext.replace(/^\./, "")
        };

        newFiles.push(record);
        totalBytes += item.sizeBytes;
        indexedCount++;
      }

      this.indexState = {
        workspaceRoot: rootFsPath,
        lastIndexedAt: new Date().toISOString(),
        files: newFiles,
        totalBytes
      };

      await this.saveToStorage();
      return { indexedCount, skippedCount, totalBytes };
    } finally {
      this.isIndexing = false;
    }
  }
}
