import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface WorkspaceRecord {
  id: string;
  name: string;
  path: string;
  port?: number;
}

export interface WorkspacePickerResult {
  canceled: boolean;
  path?: string;
}

function pathKey(value: string): string {
  const normalized = resolve(value).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function canonicalWorkspaceDirectory(inputPath: string): string {
  if (typeof inputPath !== "string" || !inputPath.trim()) {
    throw new Error("INVALID_WORKSPACE_PATH");
  }
  if (!isAbsolute(inputPath.trim())) throw new Error("WORKSPACE_PATH_NOT_ABSOLUTE");
  const resolved = resolve(inputPath.trim());
  if (!existsSync(resolved)) throw new Error("WORKSPACE_NOT_FOUND");
  let canonical: string;
  try {
    canonical = realpathSync.native(resolved);
  } catch {
    try {
      canonical = realpathSync(resolved);
    } catch {
      throw new Error("WORKSPACE_UNAVAILABLE");
    }
  }
  if (!statSync(canonical).isDirectory()) throw new Error("WORKSPACE_NOT_DIRECTORY");
  return canonical;
}

export function stableWorkspaceId(canonicalPath: string): string {
  const digest = createHash("sha256")
    .update(pathKey(canonicalPath))
    .digest("hex")
    .slice(0, 12);
  return `local-${digest}`;
}

export function loadUserWorkspaceRegistry(registryPath: string): WorkspaceRecord[] {
  const absolute = resolve(registryPath);
  if (!existsSync(absolute)) return [];
  const raw = JSON.parse(readFileSync(absolute, "utf8"));
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.workspaces)) {
    throw new Error("INVALID_LOCAL_REGISTRY");
  }
  const results: WorkspaceRecord[] = [];
  const seen = new Set<string>();
  for (const value of raw.workspaces) {
    if (!value || typeof value !== "object") throw new Error("INVALID_LOCAL_REGISTRY");
    const id = typeof value.id === "string" ? value.id.trim() : "";
    const name = typeof value.name === "string" ? value.name.trim() : "";
    const candidatePath = typeof value.path === "string" ? value.path.trim() : "";
    if (!id || !name || !candidatePath) throw new Error("INVALID_LOCAL_REGISTRY");
    const key = pathKey(candidatePath);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ id, name, path: resolve(candidatePath), port: 0 });
  }
  return results;
}

export function mergeWorkspaceRegistries(
  configured: WorkspaceRecord[],
  local: WorkspaceRecord[],
): WorkspaceRecord[] {
  const merged: WorkspaceRecord[] = [];
  const seenPaths = new Set<string>();
  const seenIds = new Set<string>();
  for (const entry of [...configured, ...local]) {
    const canonicalPath = resolve(entry.path);
    const key = pathKey(canonicalPath);
    if (seenPaths.has(key)) continue;
    let id = entry.id;
    if (seenIds.has(id)) id = stableWorkspaceId(canonicalPath);
    seenIds.add(id);
    seenPaths.add(key);
    merged.push({ ...entry, id, path: canonicalPath });
  }
  return merged;
}

export function saveUserWorkspaceRegistry(
  registryPath: string,
  workspaces: WorkspaceRecord[],
): void {
  const absolute = resolve(registryPath);
  mkdirSync(dirname(absolute), { recursive: true });
  const tempPath = `${absolute}.${process.pid}.${randomUUID()}.tmp`;
  const payload = `${JSON.stringify({ version: 1, workspaces }, null, 2)}\n`;
  writeFileSync(tempPath, payload, { encoding: "utf8", flag: "wx" });
  renameSync(tempPath, absolute);
}

export function registerUserWorkspace(
  registryPath: string,
  inputPath: string,
  requestedName?: string,
): { workspace: WorkspaceRecord; created: boolean } {
  const canonicalPath = canonicalWorkspaceDirectory(inputPath);
  const existing = loadUserWorkspaceRegistry(registryPath);
  const key = pathKey(canonicalPath);
  const duplicate = existing.find((item) => pathKey(item.path) === key);
  if (duplicate) return { workspace: duplicate, created: false };

  const name = requestedName?.trim() || basename(canonicalPath) || canonicalPath;
  const workspace: WorkspaceRecord = {
    id: stableWorkspaceId(canonicalPath),
    name,
    path: canonicalPath,
    port: 0,
  };
  saveUserWorkspaceRegistry(registryPath, [...existing, workspace]);
  return { workspace, created: true };
}

export async function pickWindowsWorkspaceFolder(
  timeoutMs = 10 * 60_000,
): Promise<WorkspacePickerResult> {
  if (process.platform !== "win32") throw new Error("PICKER_UNSUPPORTED");
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
    "$dialog.Description = 'Choose a project workspace for Harness Atlas'",
    "$dialog.ShowNewFolderButton = $false",
    "$result = $dialog.ShowDialog()",
    "if ($result -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath); exit 0 }",
    "exit 2",
  ].join("; ");
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-STA", "-Command", script],
      { encoding: "utf8", timeout: timeoutMs, windowsHide: true, maxBuffer: 32_768 },
    );
    const selected = stdout.trim();
    return selected ? { canceled: false, path: selected } : { canceled: true };
  } catch (error: any) {
    if (error?.code === 2) return { canceled: true };
    if (error?.killed || error?.signal) throw new Error("PICKER_TIMEOUT");
    throw new Error("PICKER_FAILED");
  }
}
