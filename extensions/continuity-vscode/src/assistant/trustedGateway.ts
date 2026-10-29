import type * as vscode from "vscode";
import { lstat, realpath } from "node:fs/promises";
import * as path from "node:path";
import { isContained, isIgnoredRelativePath, MAX_FILE_BYTES } from "./guards";
import type { MementoLike } from "../assistantStore";

export interface AutoWriteAuditRecord {
  id: string;
  timestamp: string;
  action: "create" | "replace";
  relativePath: string;
  bytesWritten: number;
  success: boolean;
  reason?: string;
}

const SENSITIVE_FILE_NAMES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".git",
  "id_rsa",
  "id_ed25519",
  "credentials.json",
  "secrets.json"
]);

const SENSITIVE_EXTENSIONS = new Set([
  ".pem",
  ".key",
  ".pfx",
  ".p12",
  ".cert",
  ".crt"
]);

export function isSensitivePath(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, "/");
  const segments = normalized.split("/");
  const fileName = segments.at(-1)?.toLowerCase() ?? "";

  if (SENSITIVE_FILE_NAMES.has(fileName) || fileName.startsWith(".env")) {
    return true;
  }

  const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : "";
  if (SENSITIVE_EXTENSIONS.has(ext)) {
    return true;
  }

  return false;
}

/**
 * Validates whether a file target is safe for trusted auto-write operations.
 * Strictly disallows deletions, symlinks/reparse points, sensitive files, binary files, and out-of-workspace paths.
 */
export async function validateAutoWriteTarget(
  rootFsPath: string | undefined,
  targetRelativePath: string,
  operation: "create" | "replace"
): Promise<{ allowed: boolean; reason?: string; targetFsPath?: string }> {
  if (!rootFsPath) {
    return { allowed: false, reason: "No active workspace root." };
  }

  if (operation !== "create" && operation !== "replace") {
    return { allowed: false, reason: `Disallowed operation '${operation}'. Only create and replace are permitted.` };
  }

  const normalizedRel = targetRelativePath.replace(/\\/g, "/").trim();
  if (!normalizedRel || normalizedRel.startsWith("/") || normalizedRel.startsWith("\\")) {
    return { allowed: false, reason: "Invalid target path." };
  }

  if (isIgnoredRelativePath(normalizedRel) || isSensitivePath(normalizedRel)) {
    return { allowed: false, reason: `Target path '${normalizedRel}' is sensitive or ignored.` };
  }

  const root = await realpath(rootFsPath);
  const targetFsPath = path.resolve(root, normalizedRel);

  if (!isContained(root, targetFsPath)) {
    return { allowed: false, reason: "Target path resolves outside the workspace." };
  }

  try {
    const linkInfo = await lstat(targetFsPath);
    if (linkInfo.isSymbolicLink()) {
      return { allowed: false, reason: "Cannot write to a symbolic link or reparse point." };
    }

    if (operation === "create") {
      return { allowed: false, reason: "Target file already exists. Create operation cannot overwrite existing files; use replace instead." };
    }

    if (operation === "replace") {
      if (!linkInfo.isFile() || linkInfo.size > MAX_FILE_BYTES) {
        return { allowed: false, reason: "Target is not a regular file or exceeds max file size." };
      }
      const resolved = await realpath(targetFsPath);
      if (!isContained(root, resolved)) {
        return { allowed: false, reason: "Target resolves outside workspace root." };
      }
    }
  } catch {
    // Target does not exist yet
    if (operation === "replace") {
      return { allowed: false, reason: "Cannot replace a non-existent file." };
    }
    // For create: verify parent directory
    const parentDir = path.dirname(targetFsPath);
    try {
      const resolvedParent = await realpath(parentDir);
      if (!isContained(root, resolvedParent) && root !== resolvedParent) {
        return { allowed: false, reason: "Parent directory is outside workspace." };
      }
    } catch {
      // Parent dir will be created inside root
    }
  }

  return { allowed: true, targetFsPath };
}

export class AutoWriteAuditStore {
  private records: AutoWriteAuditRecord[] = [];

  constructor(
    private readonly workspaceState: MementoLike,
    private readonly stateKey: string = "continuity.autoWriteAudit"
  ) {
    this.records = this.workspaceState.get<AutoWriteAuditRecord[]>(this.stateKey) ?? [];
  }

  getRecords(): AutoWriteAuditRecord[] {
    return [...this.records];
  }

  async appendRecord(record: Omit<AutoWriteAuditRecord, "id" | "timestamp">): Promise<AutoWriteAuditRecord> {
    const fullRecord: AutoWriteAuditRecord = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...record
    };

    this.records.push(fullRecord);
    if (this.records.length > 500) {
      this.records = this.records.slice(-500);
    }
    await this.workspaceState.update(this.stateKey, this.records);
    return fullRecord;
  }

  async clear(): Promise<void> {
    this.records = [];
    await this.workspaceState.update(this.stateKey, []);
  }
}

export interface AutoWriteRequest {
  operation: "create" | "replace";
  relativePath: string;
  content: string;
}

export class TrustedAutoWriteGateway {
  constructor(
    private readonly isEnabled: () => boolean,
    private readonly auditStore: AutoWriteAuditStore,
    private readonly workspaceEditApplier?: (targetFsPath: string, op: "create" | "replace", content: string) => Promise<boolean>
  ) {}

  /**
   * Executes a safe WorkspaceEdit transaction if trusted mode is active and target passes all safety checks.
   */
  async executeAutoWrite(
    rootFsPath: string | undefined,
    request: AutoWriteRequest
  ): Promise<{ success: boolean; message: string; record: AutoWriteAuditRecord }> {
    const { operation, relativePath, content } = request;

    if (!this.isEnabled()) {
      const record = await this.auditStore.appendRecord({
        action: operation,
        relativePath,
        bytesWritten: 0,
        success: false,
        reason: "Trusted Auto-Write is disabled for this workspace."
      });
      return { success: false, message: "Trusted Auto-Write is disabled. Enable it in settings or via command.", record };
    }

    const contentBuffer = Buffer.from(content, "utf8");
    if (contentBuffer.length > MAX_FILE_BYTES || content.includes("\0")) {
      const record = await this.auditStore.appendRecord({
        action: operation,
        relativePath,
        bytesWritten: 0,
        success: false,
        reason: "Content exceeds maximum file size or contains binary characters."
      });
      return { success: false, message: "Content rejected: file too large or binary.", record };
    }

    const validation = await validateAutoWriteTarget(rootFsPath, relativePath, operation);
    if (!validation.allowed || !validation.targetFsPath) {
      const record = await this.auditStore.appendRecord({
        action: operation,
        relativePath,
        bytesWritten: 0,
        success: false,
        reason: validation.reason ?? "Target validation failed."
      });
      return { success: false, message: `Auto-write rejected: ${validation.reason}`, record };
    }

    try {
      if (this.workspaceEditApplier) {
        const applied = await this.workspaceEditApplier(validation.targetFsPath, operation, content);
        if (!applied) {
          const record = await this.auditStore.appendRecord({
            action: operation,
            relativePath,
            bytesWritten: 0,
            success: false,
            reason: "VS Code WorkspaceEdit transaction was rejected or aborted."
          });
          return { success: false, message: "Failed to apply workspace edit transaction.", record };
        }
      }

      const record = await this.auditStore.appendRecord({
        action: operation,
        relativePath,
        bytesWritten: contentBuffer.length,
        success: true
      });

      return { success: true, message: `Auto-write applied successfully to ${relativePath} (${contentBuffer.length} bytes).`, record };
    } catch (err: any) {
      const record = await this.auditStore.appendRecord({
        action: operation,
        relativePath,
        bytesWritten: 0,
        success: false,
        reason: err?.message ?? String(err)
      });
      return { success: false, message: `Auto-write error: ${err?.message ?? err}`, record };
    }
  }
}
