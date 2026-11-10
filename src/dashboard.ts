import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import {
  buildContextPacket,
  buildProjectFlow,
  buildProjectIndex,
  createHarnessSession,
  discoverProviderStates,
  extractFileRelationships,
  loadHarnessSessions,
  readSafeProjectFile,
  updateHarnessSession,
  type OrchestrationMode,
} from "./universalHarness.js";
import {
  loadUserWorkspaceRegistry,
  mergeWorkspaceRegistries,
  pickWindowsWorkspaceFolder,
  registerUserWorkspace,
} from "./workspaceRegistry.js";
import { runAntigravity } from "./antigravityAdapter.js";
import { LoopEngine } from "./loopEngine.js";
import { handleLoopRequest } from "./loopRoutes.js";

export interface RegisteredWorkspace {
  id: string;
  name: string;
  path: string;
  port?: number;
}

export interface TimelineEvent {
  id: string;
  type:
    | "CHECKPOINT_REQUESTED"
    | "CHECKPOINT_DECIDED"
    | "DECISION"
    | "STAGE_CHANGE";
  timestamp: string;
  title: string;
  description: string;
  actor?: string;
  badgeVariant: "purple" | "blue" | "green" | "amber" | "rose";
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  path: string;
  port?: number;
  status: "ACTIVE" | "UNAVAILABLE";
  instanceHealth?: "ONLINE" | "OFFLINE" | "UNKNOWN";
  error?: string;
  stage?: string;
  currentChangeId?: string | null;
  tasksCount?: number;
  blockersCount?: number;
  gitClean?: boolean;
  recentActivity?: string;
}

export interface DashboardOptions {
  workspaceRoot?: string;
  port?: number;
  registryPath?: string;
}

async function readJsonRequest(
  req: IncomingMessage,
  maximumBytes = 256_000,
): Promise<any> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maximumBytes) {
        reject(new Error("REQUEST_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolvePromise(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error("INVALID_JSON"));
      }
    });
    req.on("error", reject);
  });
}

const ALLOWLISTED_PREFIXES = ["openspec", "reports", "tasks", ".continuity"];

export function isPathContained(
  workspaceRoot: string,
  targetPath: string,
): boolean {
  const root = resolve(workspaceRoot);
  const target = resolve(targetPath);
  if (root === target) return true;
  const rel = relative(root, target);
  return Boolean(rel && !rel.startsWith("..") && !isAbsolute(rel));
}

export function isAllowlistedArtifact(
  workspaceRoot: string,
  targetPath: string,
): boolean {
  if (!isPathContained(workspaceRoot, targetPath)) return false;
  const rel = relative(resolve(workspaceRoot), resolve(targetPath)).replace(
    /\\/g,
    "/",
  );
  return ALLOWLISTED_PREFIXES.some(
    (prefix) => rel === prefix || rel.startsWith(prefix + "/"),
  );
}

export function getGitSummary(workspaceRoot: string): {
  branch: string;
  clean: boolean;
  modifiedFiles: string[];
} {
  let gitDir = join(workspaceRoot, ".git");
  try {
    if (!existsSync(gitDir)) {
      return { branch: "unknown", clean: true, modifiedFiles: [] };
    }
    if (statSync(gitDir).isFile()) {
      const pointer = readFileSync(gitDir, "utf8").trim();
      if (!pointer.startsWith("gitdir:")) {
        return { branch: "unknown", clean: true, modifiedFiles: [] };
      }
      gitDir = resolve(dirname(gitDir), pointer.slice("gitdir:".length).trim());
    }
  } catch {
    return { branch: "unknown", clean: true, modifiedFiles: [] };
  }

  let branch = "unknown";
  try {
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    branch = head.startsWith("ref: refs/heads/")
      ? head.slice("ref: refs/heads/".length)
      : head.slice(0, 12) || "unknown";
  } catch {
    return { branch: "unknown", clean: true, modifiedFiles: [] };
  }

  try {
    const statusOut = execFileSync(
      "git",
      ["status", "--porcelain", "--untracked-files=no"],
      {
        cwd: workspaceRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 1_500,
      },
    ).trim();
    const modifiedFiles = statusOut
      ? statusOut
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      : [];
    return {
      branch,
      clean: modifiedFiles.length === 0,
      modifiedFiles,
    };
  } catch {
    return { branch, clean: true, modifiedFiles: [] };
  }
}

export function getAllowlistedArtifactsList(workspaceRoot: string): string[] {
  const results: string[] = [];
  const root = resolve(workspaceRoot);

  for (const prefix of ALLOWLISTED_PREFIXES) {
    const dir = join(root, prefix);
    if (!existsSync(dir)) continue;

    const scan = (currentDir: string) => {
      try {
        const entries = readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(currentDir, entry.name);
          if (entry.isDirectory()) {
            scan(fullPath);
          } else if (entry.isFile()) {
            const rel = relative(root, fullPath).replace(/\\/g, "/");
            results.push(rel);
          }
        }
      } catch {}
    };
    scan(dir);
  }
  return results;
}

export function validateWorkspaceRegistryData(
  raw: any,
  sourcePath = "registry",
  defaultPort = 3456,
): RegisteredWorkspace[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      `Invalid registry format in ${sourcePath}: Root must be an object.`,
    );
  }
  if (!Array.isArray(raw.workspaces)) {
    throw new Error(
      `Invalid registry format in ${sourcePath}: Missing "workspaces" array.`,
    );
  }
  if (raw.workspaces.length === 0) {
    throw new Error(
      `Invalid registry format in ${sourcePath}: "workspaces" array cannot be empty.`,
    );
  }

  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  const results: RegisteredWorkspace[] = [];

  for (let i = 0; i < raw.workspaces.length; i++) {
    const entry = raw.workspaces[i];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(
        `Invalid workspace entry at index ${i} in ${sourcePath}: Entry must be an object.`,
      );
    }

    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id) {
      throw new Error(
        `Invalid workspace entry at index ${i} in ${sourcePath}: "id" must be a non-empty string.`,
      );
    }
    if (seenIds.has(id)) {
      throw new Error(
        `Duplicate workspace id "${id}" found at index ${i} in ${sourcePath}.`,
      );
    }
    seenIds.add(id);

    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (!name) {
      throw new Error(
        `Invalid workspace entry "${id}" in ${sourcePath}: "name" must be a non-empty string.`,
      );
    }

    const rawPath = typeof entry.path === "string" ? entry.path.trim() : "";
    if (!rawPath) {
      throw new Error(
        `Invalid workspace entry "${id}" in ${sourcePath}: "path" must be a non-empty string.`,
      );
    }
    const canonicalPath = resolve(rawPath);
    if (seenPaths.has(canonicalPath)) {
      throw new Error(
        `Duplicate workspace path "${canonicalPath}" found for entry "${id}" in ${sourcePath}.`,
      );
    }
    seenPaths.add(canonicalPath);

    let port = defaultPort;
    if (entry.port !== undefined) {
      if (
        typeof entry.port !== "number" ||
        !Number.isSafeInteger(entry.port) ||
        entry.port < 0 ||
        entry.port > 65535
      ) {
        throw new Error(
          `Invalid port for workspace "${id}" in ${sourcePath}: ${entry.port}. Port must be an integer between 0 and 65535.`,
        );
      }
      port = entry.port;
    }

    results.push({
      id,
      name,
      path: canonicalPath,
      port,
    });
  }

  return results;
}

export function loadWorkspaceRegistry(
  registryPath: string,
  defaultWorkspaceRoot: string,
  defaultPort = 3456,
  isExplicit = false,
): RegisteredWorkspace[] {
  const resolvedRegistryPath = resolve(registryPath);
  if (existsSync(resolvedRegistryPath)) {
    try {
      if (statSync(resolvedRegistryPath).isDirectory()) {
        throw new Error(
          `Registry path is a directory, expected a JSON file: ${resolvedRegistryPath}`,
        );
      }
    } catch (err: any) {
      if (err.message.includes("is a directory")) throw err;
    }
    let rawJson: any;
    try {
      const text = readFileSync(resolvedRegistryPath, "utf8");
      rawJson = JSON.parse(text);
    } catch (err: any) {
      throw new Error(
        `Invalid JSON syntax in registry file "${resolvedRegistryPath}": ${err?.message || err}`,
      );
    }
    return validateWorkspaceRegistryData(
      rawJson,
      resolvedRegistryPath,
      defaultPort,
    );
  }

  if (isExplicit) {
    throw new Error(`Registry file does not exist: "${resolvedRegistryPath}"`);
  }

  return [
    {
      id: "default",
      name: "Default Workspace",
      path: resolve(defaultWorkspaceRoot),
      port: defaultPort,
    },
  ];
}

export async function probeWorkspaceInstanceHealth(
  port?: number,
  timeoutMs = 800,
): Promise<"ONLINE" | "OFFLINE" | "UNKNOWN"> {
  if (
    typeof port !== "number" ||
    !Number.isSafeInteger(port) ||
    port <= 0 ||
    port > 65535
  ) {
    return "UNKNOWN";
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.status === "ok") {
        return "ONLINE";
      }
    }
    return "OFFLINE";
  } catch {
    return "OFFLINE";
  } finally {
    clearTimeout(timer);
  }
}

export function extractWorkflowTimeline(
  state: any,
  limit = 20,
): TimelineEvent[] {
  if (!state || typeof state !== "object") {
    return [];
  }

  const events: TimelineEvent[] = [];

  // 1. Checkpoint events
  if (Array.isArray(state.checkpoints)) {
    for (const cp of state.checkpoints) {
      if (!cp || typeof cp !== "object") continue;
      const cpId = String(cp.id || "");
      const cpType = String(cp.type || "checkpoint");
      const changeId = cp.changeId ? ` [${cp.changeId}]` : "";

      if (cp.createdAt) {
        events.push({
          id: `${cpId}-req`,
          type: "CHECKPOINT_REQUESTED",
          timestamp: cp.createdAt,
          title: `Checkpoint Requested: ${cpType}${changeId}`,
          description: cp.payload || "No review payload provided",
          badgeVariant: "amber",
        });
      }

      if (cp.decidedAt) {
        const isApproved = cp.status === "APPROVED";
        events.push({
          id: `${cpId}-dec`,
          type: "CHECKPOINT_DECIDED",
          timestamp: cp.decidedAt,
          title: `Checkpoint ${cp.status || "DECIDED"}: ${cpType}${changeId}`,
          description:
            cp.reasoning ||
            (isApproved ? "Approved by reviewer" : "Rejected by reviewer"),
          badgeVariant: isApproved ? "green" : "rose",
        });
      }
    }
  }

  // 2. Decisions
  if (Array.isArray(state.decisions)) {
    for (let i = 0; i < state.decisions.length; i++) {
      const d = state.decisions[i];
      if (!d || typeof d !== "object") continue;
      events.push({
        id: `dec-${d.timestamp || i}-${i}`,
        type: "DECISION",
        timestamp: d.timestamp || new Date(0).toISOString(),
        title: d.decision || "Workflow Decision Logged",
        description: d.reasoning || "",
        actor: d.actor || "developer",
        badgeVariant: "blue",
      });
    }
  }

  // 3. Deterministic descending sort by timestamp (newest first), tie-breaking on id
  events.sort((a, b) => {
    const timeA = Date.parse(a.timestamp) || 0;
    const timeB = Date.parse(b.timestamp) || 0;
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    return a.id.localeCompare(b.id);
  });

  const clampedLimit = Math.min(Math.max(1, limit), 50);
  return events.slice(0, clampedLimit);
}

export async function getWorkspacesSummaryList(
  registry: RegisteredWorkspace[],
): Promise<WorkspaceSummary[]> {
  const promises = registry.map(async (w): Promise<WorkspaceSummary> => {
    const canonicalPath = resolve(w.path);
    if (!existsSync(canonicalPath)) {
      return {
        id: w.id,
        name: w.name,
        path: canonicalPath,
        port: w.port,
        status: "UNAVAILABLE",
        instanceHealth: "UNKNOWN",
        error: "Workspace directory does not exist",
      };
    }
    try {
      if (!statSync(canonicalPath).isDirectory()) {
        return {
          id: w.id,
          name: w.name,
          path: canonicalPath,
          port: w.port,
          status: "UNAVAILABLE",
          instanceHealth: "UNKNOWN",
          error: "Workspace path is not a directory",
        };
      }
    } catch {
      return {
        id: w.id,
        name: w.name,
        path: canonicalPath,
        port: w.port,
        status: "UNAVAILABLE",
        instanceHealth: "UNKNOWN",
        error: "Cannot access workspace directory",
      };
    }

    let stage = "IDLE";
    let currentChangeId: string | null = null;
    let tasksCount = 0;
    let blockersCount = 0;
    let recentActivity = "No recent activity";
    const statePath = join(canonicalPath, ".continuity", "state.json");
    if (isPathContained(canonicalPath, statePath) && existsSync(statePath)) {
      try {
        const state = JSON.parse(readFileSync(statePath, "utf8"));
        stage = state.stage || "IDLE";
        currentChangeId = state.currentChangeId || null;
        tasksCount = Array.isArray(state.tasks) ? state.tasks.length : 0;
        blockersCount = Array.isArray(state.blockers)
          ? state.blockers.length
          : 0;
        const timeline = extractWorkflowTimeline(state, 1);
        if (timeline.length > 0) {
          recentActivity = timeline[0].title;
        }
      } catch {}
    }

    const git = getGitSummary(canonicalPath);
    const instanceHealth = await probeWorkspaceInstanceHealth(w.port);

    return {
      id: w.id,
      name: w.name,
      path: canonicalPath,
      port: w.port,
      status: "ACTIVE",
      instanceHealth,
      stage,
      currentChangeId,
      tasksCount,
      blockersCount,
      gitClean: git.clean,
      recentActivity,
    };
  });

  return Promise.all(promises);
}

export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Continuity Core Dashboard · Harness Atlas</title>
  <script>
    (() => {
      try {
        const stored = localStorage.getItem("harness-atlas-theme-v1");
        const preference = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
        const resolved = preference === "system"
          ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
          : preference;
        document.documentElement.dataset.theme = resolved;
        document.documentElement.dataset.themePreference = preference;
      } catch {
        document.documentElement.dataset.theme = "dark";
        document.documentElement.dataset.themePreference = "system";
      }
    })();
  </script>
  <style>
    :root {
      --bg-dark: #080b10;
      --card-bg: #10141b;
      --card-border: rgba(255, 255, 255, 0.08);
      --accent-blue: #38bdf8;
      --accent-purple: #a855f7;
      --accent-green: #22c55e;
      --accent-amber: #f59e0b;
      --accent-rose: #f43f5e;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-dark);
      background-image: radial-gradient(at 0% 0%, rgba(56, 189, 248, 0.12) 0px, transparent 50%),
                        radial-gradient(at 100% 100%, rgba(168, 85, 247, 0.12) 0px, transparent 50%);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
      min-height: 100vh;
      padding: 0;
      overflow-x: hidden;
    }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    .glass-card {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 20px;
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
      transition: all 0.2s ease;
    }
    .glass-card:hover {
      border-color: rgba(255, 255, 255, 0.15);
      box-shadow: 0 12px 40px 0 rgba(0, 0, 0, 0.45);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-blue { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }
    .badge-green { background: rgba(34, 197, 94, 0.15); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.3); }
    .badge-amber { background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); }
    .badge-rose { background: rgba(244, 63, 94, 0.15); color: #f43f5e; border: 1px solid rgba(244, 63, 94, 0.3); }
    .badge-purple { background: rgba(168, 85, 247, 0.15); color: #a855f7; border: 1px solid rgba(168, 85, 247, 0.3); }

    /* Workflow Lane */
    .lane-container {
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: relative;
      padding: 24px 8px;
      overflow-x: auto;
    }
    .lane-step {
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
      z-index: 2;
      min-width: 110px;
    }
    .lane-circle {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.85rem;
      background: #1e293b;
      border: 2px solid #334155;
      color: var(--text-muted);
      transition: all 0.3s ease;
    }
    .lane-step.active .lane-circle {
      background: linear-gradient(135deg, #0284c7, #38bdf8);
      border-color: #38bdf8;
      color: white;
      box-shadow: 0 0 20px rgba(56, 189, 248, 0.6);
      transform: scale(1.15);
    }
    .lane-step.passed .lane-circle {
      background: rgba(34, 197, 94, 0.2);
      border-color: #22c55e;
      color: #22c55e;
    }
    .lane-line {
      position: absolute;
      top: 46px;
      left: 60px;
      right: 60px;
      height: 3px;
      background: #334155;
      z-index: 1;
    }
    .lane-line-progress {
      height: 100%;
      background: linear-gradient(90deg, #22c55e, #38bdf8);
      transition: width 0.4s ease;
    }

    .pulse-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: #22c55e;
      margin-right: 8px;
      box-shadow: 0 0 8px #22c55e;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
    }
    button, input, select, textarea { font: inherit; }
    button, select { cursor: pointer; }
    button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
      outline: 2px solid #7dd3fc;
      outline-offset: 2px;
    }
    .app-shell { min-height: 100vh; display: flex; flex-direction: column; }
    .topbar {
      height: 72px; display: grid; grid-template-columns: minmax(220px, 1fr) minmax(260px, 440px) minmax(220px, 1fr);
      align-items: center; gap: 24px; padding: 0 22px; border-bottom: 1px solid #232a35;
      background: rgba(8, 11, 16, 0.96); position: sticky; top: 0; z-index: 10;
    }
    .brand-block { display: flex; align-items: center; gap: 11px; }
    .brand-mark {
      width: 34px; height: 34px; display: grid; place-items: center; border-radius: 9px; font-weight: 900;
      color: #061018; background: linear-gradient(135deg, #7dd3fc, #34d399); box-shadow: 0 0 24px rgba(56,189,248,.22);
    }
    .brand-block h1 { font-size: .98rem; letter-spacing: -.02em; }
    .brand-block p { color: #6f7b8d; font-size: .72rem; margin-top: 2px; }
    .eyebrow { color: #667386; font-size: .64rem; font-weight: 800; letter-spacing: .13em; }
    .project-switcher { display: flex; flex-direction: column; gap: 5px; }
    .project-switcher-row { display: flex; align-items: center; gap: 7px; }
    .project-switcher-row select { min-width: 0; flex: 1; }
    .choose-workspace { flex: 0 0 auto; padding: 8px 10px; color: #9de8ff; background: #10212b; border: 1px solid #24526a; border-radius: 8px; font-size: .68rem; }
    .choose-workspace:hover { color: #e8fbff; border-color: #38bdf8; }
    .path-entry { display: flex; gap: 6px; }
    .path-entry input { min-width: 0; flex: 1; padding: 7px 9px; color: #dbe7f4; background: #10161e; border: 1px solid #2b3542; border-radius: 7px; font-size: .68rem; }
    .project-switcher select, .mode-select select {
      color: #e7edf6; background: #131922; border: 1px solid #293241; border-radius: 8px; padding: 8px 11px;
    }
    .topbar-meta { justify-self: end; display: flex; align-items: center; gap: 8px; color: #8190a4; font-size: .75rem; }
    .topbar-meta kbd { border: 1px solid #2b3440; border-bottom-width: 2px; border-radius: 5px; padding: 3px 6px; background: #12171f; }
    .theme-switcher { display: inline-flex; align-items: center; padding: 2px; border: 1px solid #2b3440; border-radius: 8px; background: #111720; }
    .theme-switcher button { display: flex; align-items: center; gap: 4px; padding: 5px 7px; color: #738095; background: transparent; border: 0; border-radius: 6px; font-size: .63rem; }
    .theme-switcher button:hover { color: #d9e7f5; }
    .theme-switcher button.active { color: #dff8ff; background: #203342; box-shadow: inset 0 0 0 1px #32627a; }
    .live-dot { width: 7px; height: 7px; border-radius: 50%; background: #34d399; box-shadow: 0 0 10px #34d399; }
    .error-banner { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 10px 18px; color: #fecdd3; background: #3a111d; border-bottom: 1px solid #7f1d38; font-size: .84rem; }
    .error-banner button { color: inherit; background: transparent; border: 0; font-size: 1.2rem; }
    .workspace-grid { display: grid; grid-template-columns: 300px minmax(420px, 1fr) 330px; min-height: calc(100vh - 72px); }
    .panel { min-width: 0; background: #0d1117; }
    .explorer-panel, .agent-panel { display: flex; flex-direction: column; max-height: calc(100vh - 72px); position: sticky; top: 72px; }
    .explorer-panel { border-right: 1px solid #222933; }
    .agent-panel { border-left: 1px solid #222933; }
    .canvas-panel { background: radial-gradient(circle at 50% 0%, rgba(34,211,238,.055), transparent 32%), #0a0e14; }
    .panel-heading { display: flex; justify-content: space-between; align-items: center; padding: 20px 18px 14px; }
    .panel-heading h2 { margin-top: 4px; font-size: .98rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }
    .count-pill { padding: 3px 8px; border-radius: 999px; color: #8fa0b6; background: #171d26; border: 1px solid #29313d; font-size: .7rem; }
    .search-box { margin: 0 14px 12px; display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: #131820; border: 1px solid #252d38; border-radius: 8px; color: #68768a; }
    .search-box:focus-within { border-color: #38bdf8; box-shadow: 0 0 0 3px rgba(56,189,248,.08); }
    .search-box input { width: 100%; color: #dfe7f1; background: transparent; border: 0; outline: 0; font-size: .78rem; }
    .technology-row { display: flex; flex-wrap: wrap; gap: 5px; padding: 0 14px 12px; }
    .tech-chip, .context-badges span { color: #8be0ff; background: #10212b; border: 1px solid #1d4352; border-radius: 5px; padding: 3px 6px; font-size: .64rem; }
    .file-list { flex: 1; overflow: auto; padding: 3px 8px 12px; scrollbar-width: thin; scrollbar-color: #303b49 transparent; }
    .file-row { display: flex; align-items: center; border: 1px solid transparent; border-radius: 7px; }
    .file-row:hover, .file-row.active { background: #151b24; border-color: #242e3a; }
    .file-row.active { box-shadow: inset 2px 0 #38bdf8; }
    .file-open { min-width: 0; flex: 1; display: flex; align-items: center; gap: 9px; padding: 8px; color: #d6dee9; background: transparent; border: 0; text-align: left; }
    .file-glyph { flex: 0 0 26px; width: 26px; height: 26px; display: grid; place-items: center; border-radius: 5px; color: #7dd3fc; background: #122532; font-size: .58rem; font-weight: 900; }
    .file-copy { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .file-copy strong, .file-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .file-copy strong { font-size: .75rem; font-weight: 650; }
    .file-copy small { max-width: 205px; color: #667386; font-size: .62rem; }
    .context-toggle { width: 27px; height: 27px; margin-right: 6px; border: 1px solid #2c3542; border-radius: 6px; color: #718096; background: transparent; }
    .context-toggle:hover, .context-toggle.selected { color: #6ee7b7; border-color: #237557; background: rgba(16,185,129,.08); }
    .panel-footer { display: flex; justify-content: space-between; gap: 8px; padding: 10px 14px; color: #5f6b7b; border-top: 1px solid #202630; font-size: .62rem; }
    .warn-text { color: #fbbf24; }
    .canvas-tabs { height: 52px; display: flex; align-items: end; gap: 4px; padding: 0 18px; border-bottom: 1px solid #222933; }
    .canvas-tabs button { height: 42px; color: #718096; background: transparent; border: 0; border-bottom: 2px solid transparent; padding: 0 12px; font-size: .74rem; }
    .canvas-tabs button.active { color: #e8edf5; border-color: #38bdf8; }
    .canvas-tabs button span { margin-left: 4px; padding: 1px 5px; border-radius: 999px; background: #1d2530; font-size: .6rem; }
    .safe-state { margin-left: auto; align-self: center; padding: 4px 8px; color: #6ee7b7; border: 1px solid #1d543f; border-radius: 999px; background: rgba(16,185,129,.07); font-size: .64rem; }
    .project-overview { max-width: 900px; margin: 0 auto; padding: clamp(32px, 6vw, 74px) clamp(24px, 5vw, 70px); }
    .hero-copy h2 { max-width: 680px; margin: 10px 0 12px; font-size: clamp(1.8rem, 4vw, 3.25rem); line-height: 1.05; letter-spacing: -.045em; }
    .hero-copy p { max-width: 680px; color: #8491a3; line-height: 1.65; font-size: .9rem; }
    .metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 30px; }
    .metric-grid article { display: flex; flex-direction: column; min-height: 112px; padding: 15px; border: 1px solid #222b36; border-radius: 10px; background: linear-gradient(145deg,#111720,#0c1118); }
    .metric-grid span, .metric-grid small { color: #657386; font-size: .65rem; }
    .metric-grid strong { margin: auto 0 5px; color: #ecf4ff; font-size: 1.3rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .architecture-card { display: flex; align-items: center; gap: 10px; margin-top: 14px; padding: 17px; border: 1px solid #23303b; border-radius: 10px; background: #0e141c; overflow-x: auto; }
    .arch-node { flex: 0 0 auto; padding: 9px 12px; border-radius: 7px; font-size: .7rem; }
    .source-node { color: #bfdbfe; background: #14253b; border: 1px solid #25476d; }
    .context-node { color: #a7f3d0; background: #10291f; border: 1px solid #205c42; }
    .arch-line { min-width: 25px; height: 1px; background: #354253; }
    .arch-agents { display: flex; gap: 5px; }
    .arch-agents span { flex: 0 0 auto; padding: 7px 9px; border: 1px solid #333d4b; border-radius: 6px; color: #aab6c5; background: #151b23; font-size: .65rem; }
    .activity-strip { display: flex; justify-content: space-between; gap: 16px; margin-top: 14px; padding: 14px 16px; border-left: 2px solid #38bdf8; background: #10161e; }
    .activity-strip div { display: flex; flex-direction: column; gap: 5px; }
    .activity-strip strong { font-size: .75rem; }
    .activity-strip > span { color: #667386; font-size: .65rem; }
    .code-view { height: calc(100vh - 124px); display: flex; flex-direction: column; }
    .code-header { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 17px 20px; border-bottom: 1px solid #202731; }
    .code-header h2 { margin-top: 5px; font-size: .84rem; font-family: ui-monospace, monospace; }
    .secondary-button { padding: 7px 10px; color: #a8b4c4; background: #141a23; border: 1px solid #2a3441; border-radius: 7px; font-size: .68rem; }
    .secondary-button.selected { color: #6ee7b7; border-color: #226a4d; }
    .code-block { flex: 1; margin: 0; overflow: auto; padding: 22px; color: #c9d4e2; background: #080c11; font: .76rem/1.65 ui-monospace, SFMono-Regular, Consolas, monospace; tab-size: 2; }
    .code-loading { flex: 1; display: grid; place-items: center; color: #738095; }
    .relationship-dock { min-height: 65px; display: flex; align-items: center; flex-wrap: wrap; gap: 7px; padding: 12px 18px; border-top: 1px solid #222933; }
    .relationship-dock button { padding: 5px 8px; color: #93c5fd; background: #111e31; border: 1px solid #203b62; border-radius: 5px; font-size: .63rem; }
    .empty-canvas, .relationship-view { min-height: calc(100vh - 124px); padding: clamp(34px, 7vw, 80px); }
    .empty-canvas { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
    .empty-canvas h2 { margin: 9px 0; font-size: 1.35rem; }
    .empty-canvas p { max-width: 520px; color: #7e8b9d; font-size: .82rem; line-height: 1.6; }
    .empty-orbit { width: 62px; height: 62px; display: grid; place-items: center; margin-bottom: 16px; color: #7dd3fc; border: 1px solid #285671; border-radius: 50%; background: radial-gradient(circle,#153348,#0c131c); font-size: 1.3rem; box-shadow: 0 0 35px rgba(56,189,248,.12); }
    .review-steps { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin-top: 22px; }
    .review-steps span { padding: 6px 9px; color: #8593a6; border: 1px solid #28313d; border-radius: 6px; background: #111720; font-size: .65rem; }
    .relationship-view .hero-copy h2 { font-size: clamp(1.25rem,3vw,2rem); word-break: break-word; }
    .relationship-graph { display: grid; grid-template-columns: minmax(140px,1fr) 40px minmax(180px,1.4fr); align-items: center; gap: 12px; margin-top: 34px; padding: 24px; border: 1px solid #24303c; border-radius: 12px; background: #0d141c; }
    .graph-node { padding: 11px; color: #c8d6e6; border: 1px solid #344253; border-radius: 8px; background: #151d27; font: .7rem ui-monospace,monospace; text-align: left; }
    .graph-node.current { color: #a5f3fc; border-color: #25627d; background: #102633; }
    .graph-edges { display: flex; flex-direction: column; align-items: center; gap: 14px; color: #38bdf8; }
    .graph-targets { display: flex; flex-direction: column; gap: 8px; }
    .relationship-empty { margin-top: 34px; padding: 50px 20px; border: 1px dashed #283340; border-radius: 12px; }
    .flow-view { min-height: calc(100vh - 124px); padding: clamp(24px, 4vw, 48px); }
    .compact-hero h2 { margin: 8px 0 9px; font-size: clamp(1.35rem, 3vw, 2.15rem); letter-spacing: -.035em; }
    .compact-hero p { max-width: 740px; color: #8290a3; font-size: .8rem; line-height: 1.6; }
    .project-flow-scroll { margin-top: 24px; overflow: auto; border: 1px solid #23303c; border-radius: 12px; background: radial-gradient(circle at 50% 20%,rgba(56,189,248,.06),transparent 44%),#090e14; }
    .project-flow-svg { display: block; min-width: 760px; width: 100%; min-height: 430px; }
    .flow-edge { stroke: #334155; stroke-width: 1.4; opacity: .85; }
    .flow-node { cursor: pointer; }
    .flow-node rect { fill: #111923; stroke: #334155; stroke-width: 1.3; transition: .18s ease; }
    .flow-node:hover rect, .flow-node:focus rect { fill: #142431; stroke: #38bdf8; }
    .flow-node text { fill: #d9e5f2; font: 600 12px ui-monospace,Consolas,monospace; pointer-events: none; }
    .flow-node-meta { fill: #748399 !important; font-size: 10px !important; font-weight: 500 !important; }
    .flow-disclosure { margin-top: 10px; color: #fbbf24; font-size: .67rem; }
    .flow-list { display: grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap: 7px; margin-top: 16px; }
    .flow-list button { min-width: 0; padding: 9px 11px; color: #a9b8ca; background: #111720; border: 1px solid #26313d; border-radius: 7px; font: .67rem ui-monospace,Consolas,monospace; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .flow-list button:hover { color: #e8f7ff; border-color: #2e6b86; }
    .harness-flow { display: flex; align-items: stretch; gap: 8px; margin-top: 28px; overflow-x: auto; padding: 4px 2px 16px; }
    .harness-step { flex: 1 0 150px; min-height: 140px; display: flex; flex-direction: column; padding: 14px; border: 1px solid #2b3542; border-radius: 10px; background: linear-gradient(145deg,#111923,#0c1219); }
    .harness-step strong { margin: 10px 0 7px; font-size: .76rem; }
    .harness-step p { color: #748399; font-size: .64rem; line-height: 1.5; }
    .harness-step small { margin-top: auto; padding-top: 12px; color: #596779; font-size: .58rem; }
    .harness-step.done { border-color: #205c42; }
    .harness-step.active { border-color: #2e6b86; box-shadow: 0 0 24px rgba(56,189,248,.08); }
    .harness-step.blocked { border-color: #713244; }
    .harness-arrow { align-self: center; color: #496075; font-size: 1.15rem; }
    .proposal-list { display: grid; gap: 10px; margin-top: 26px; }
    .proposal-card { padding: 14px 16px; border: 1px solid #344054; border-left: 3px solid #a78bfa; border-radius: 8px; background: #111720; }
    .proposal-card strong { display: block; color: #e8e2ff; font: .72rem ui-monospace,Consolas,monospace; }
    .proposal-card p { margin-top: 7px; color: #8491a3; font-size: .69rem; line-height: 1.5; }
    .provider-list { display: flex; flex-direction: column; gap: 7px; padding: 0 14px 14px; }
    .provider-card { display: grid; grid-template-columns: 32px 1fr 10px; align-items: center; gap: 9px; padding: 10px; border: 1px solid #232b36; border-radius: 8px; background: #12171f; }
    .provider-icon { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 7px; font-size: .7rem; font-weight: 900; }
    .provider-codex { color: #dbeafe; background: #1e3a5f; }
    .provider-antigravity { color: #ede9fe; background: #3b2864; }
    .provider-ollama { color: #d1fae5; background: #164e3a; }
    .provider-card > div:nth-child(2) { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .provider-card strong { font-size: .73rem; }
    .provider-card small { color: #6f7b8d; font-size: .58rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .provider-test { grid-column: 1 / -1; padding: 6px 8px; color: #c4b5fd; background: #1c1730; border: 1px solid #4c3d7a; border-radius: 6px; font-size: .62rem; }
    .provider-test:disabled { cursor: wait; opacity: .55; }
    .connection-status { grid-column: 1 / -1; color: #91a0b4; font-size: .58rem; line-height: 1.45; }
    .status-dot { width: 7px; height: 7px; border-radius: 50%; }
    .tone-green { background: #34d399; box-shadow: 0 0 8px #34d399; }
    .tone-amber { background: #fbbf24; }
    .tone-rose { background: #fb7185; }
    .tone-muted { background: #526071; }
    .mode-select { display: flex; flex-direction: column; gap: 6px; padding: 0 14px 16px; }
    .mode-select select { width: 100%; font-size: .72rem; }
    .sessions-heading { display: flex; justify-content: space-between; align-items: center; padding: 14px; border-top: 1px solid #222933; }
    .sessions-heading > div { display: flex; flex-direction: column; gap: 4px; }
    .sessions-heading strong { font-size: .72rem; }
    .sessions-heading button { width: 29px; height: 29px; color: #b9eaff; background: #112735; border: 1px solid #21536a; border-radius: 7px; }
    .session-list { max-height: 160px; overflow: auto; padding: 0 10px 10px; }
    .session-list > button { width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px; color: #aeb8c5; background: transparent; border: 1px solid transparent; border-radius: 7px; text-align: left; }
    .session-list > button:hover, .session-list > button.active { color: #eef6ff; background: #161d27; border-color: #26313e; }
    .session-list button > span:last-child { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .session-list strong, .session-list small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .session-list strong { font-size: .7rem; }
    .session-list small { color: #657386; font-size: .58rem; }
    .session-icon { width: 23px; height: 23px; display: grid; place-items: center; border-radius: 5px; background: #1a2330; font-size: .65rem; }
    .chat-history { min-height: 90px; max-height: 230px; overflow: auto; display: flex; flex-direction: column; gap: 8px; padding: 0 14px 12px; scrollbar-width: thin; }
    .chat-message { padding: 9px 10px; border: 1px solid #26303c; border-radius: 8px; background: #111720; }
    .chat-message.user { border-left: 2px solid #38bdf8; }
    .chat-message.assistant { border-left: 2px solid #a78bfa; }
    .chat-message strong { display: block; margin-bottom: 5px; color: #9caec3; font-size: .58rem; letter-spacing: .06em; text-transform: uppercase; }
    .chat-message p { color: #d8e1ec; font-size: .68rem; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
    .composer { margin-top: auto; padding: 14px; border-top: 1px solid #222933; background: #0b0f15; }
    .context-badges { display: flex; gap: 5px; margin-bottom: 8px; }
    .composer textarea { width: 100%; resize: vertical; min-height: 78px; max-height: 180px; padding: 10px; color: #e1e8f2; background: #111720; border: 1px solid #29323f; border-radius: 8px; font-size: .73rem; line-height: 1.45; }
    .primary-button { width: 100%; display: flex; justify-content: space-between; margin-top: 8px; padding: 9px 11px; color: #041016; background: linear-gradient(90deg,#67e8f9,#6ee7b7); border: 0; border-radius: 8px; font-size: .72rem; font-weight: 800; }
    .primary-button:disabled { cursor: wait; opacity: .58; }
    .composer-actions { display: grid; grid-template-columns: 1fr auto; gap: 7px; align-items: end; }
    .danger-button { padding: 9px 11px; color: #fecdd3; background: #33141e; border: 1px solid #7f1d38; border-radius: 8px; font-size: .68rem; }
    .context-summary { margin-top: 8px; color: #86efac; font-size: .62rem; line-height: 1.4; }
    .composer-note { display: block; margin-top: 8px; color: #596678; font-size: .58rem; line-height: 1.4; }
    .empty-state { color: #667386; text-align: center; }
    .empty-state.compact { padding: 18px 10px; font-size: .7rem; }
    .empty-inline { color: #657386; font-size: .65rem; }
    .skeleton { background: linear-gradient(90deg,#121820,#1a222d,#121820); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
    .file-skeleton { height: 43px; margin: 4px 0; border-radius: 7px; }
    @keyframes shimmer { to { background-position: -200% 0; } }
    html[data-theme="light"] {
      color-scheme: light;
      --bg-dark: #eef2f7;
      --card-bg: #ffffff;
      --card-border: rgba(15, 23, 42, .12);
      --text-main: #172033;
      --text-muted: #64748b;
    }
    html[data-theme="dark"] { color-scheme: dark; }
    html[data-theme="light"] body {
      background-color: #eef2f7;
      background-image: radial-gradient(at 0% 0%,rgba(14,165,233,.10),transparent 48%),radial-gradient(at 100% 100%,rgba(139,92,246,.08),transparent 48%);
    }
    html[data-theme="light"] .topbar,
    html[data-theme="light"] .panel,
    html[data-theme="light"] .composer { background: #ffffff; }
    html[data-theme="light"] .canvas-panel { background: radial-gradient(circle at 50% 0%,rgba(14,165,233,.06),transparent 32%),#f7f9fc; }
    html[data-theme="light"] .topbar,
    html[data-theme="light"] .explorer-panel,
    html[data-theme="light"] .agent-panel,
    html[data-theme="light"] .canvas-tabs,
    html[data-theme="light"] .panel-footer,
    html[data-theme="light"] .sessions-heading,
    html[data-theme="light"] .composer { border-color: #dbe2eb; }
    html[data-theme="light"] .project-switcher select,
    html[data-theme="light"] .mode-select select,
    html[data-theme="light"] .search-box,
    html[data-theme="light"] .path-entry input,
    html[data-theme="light"] .composer textarea,
    html[data-theme="light"] .theme-switcher { color: #263449; background: #f4f7fa; border-color: #cbd5e1; }
    html[data-theme="light"] .theme-switcher button { color: #64748b; }
    html[data-theme="light"] .theme-switcher button:hover { color: #0f172a; }
    html[data-theme="light"] .theme-switcher button.active { color: #075985; background: #e0f2fe; box-shadow: inset 0 0 0 1px #7dd3fc; }
    html[data-theme="light"] .file-row:hover,
    html[data-theme="light"] .file-row.active,
    html[data-theme="light"] .session-list > button:hover,
    html[data-theme="light"] .session-list > button.active { background: #eef6fb; border-color: #cbdde9; }
    html[data-theme="light"] .file-open,
    html[data-theme="light"] .code-block,
    html[data-theme="light"] .chat-message p,
    html[data-theme="light"] .provider-card strong,
    html[data-theme="light"] .session-list > button.active { color: #1e293b; }
    html[data-theme="light"] .file-glyph,
    html[data-theme="light"] .session-icon { color: #0369a1; background: #e0f2fe; }
    html[data-theme="light"] .project-flow-scroll,
    html[data-theme="light"] .architecture-card,
    html[data-theme="light"] .relationship-graph,
    html[data-theme="light"] .activity-strip,
    html[data-theme="light"] .provider-card,
    html[data-theme="light"] .chat-message,
    html[data-theme="light"] .proposal-card,
    html[data-theme="light"] .harness-step,
    html[data-theme="light"] .metric-grid article,
    html[data-theme="light"] .flow-list button { background: #ffffff; border-color: #d7e0ea; }
    html[data-theme="light"] .project-flow-scroll { background: radial-gradient(circle at 50% 20%,rgba(14,165,233,.08),transparent 44%),#f8fafc; }
    html[data-theme="light"] .flow-node rect { fill: #ffffff; stroke: #a9bacb; }
    html[data-theme="light"] .flow-node:hover rect,
    html[data-theme="light"] .flow-node:focus rect { fill: #e8f7ff; stroke: #0284c7; }
    html[data-theme="light"] .flow-node text { fill: #1e293b; }
    html[data-theme="light"] .flow-node-meta { fill: #64748b !important; }
    html[data-theme="light"] .flow-edge { stroke: #94a3b8; }
    html[data-theme="light"] .code-block { background: #f8fafc; }
    html[data-theme="light"] .secondary-button,
    html[data-theme="light"] .count-pill,
    html[data-theme="light"] .topbar-meta kbd { color: #475569; background: #f1f5f9; border-color: #cbd5e1; }
    html[data-theme="light"] .canvas-tabs button.active { color: #0f172a; }
    html[data-theme="light"] .eyebrow,
    html[data-theme="light"] .brand-block p,
    html[data-theme="light"] .file-copy small,
    html[data-theme="light"] .provider-card small,
    html[data-theme="light"] .compact-hero p,
    html[data-theme="light"] .harness-step p,
    html[data-theme="light"] .composer-note { color: #64748b; }
    html[data-theme="light"] .empty-state,
    html[data-theme="light"] .empty-inline { color: #64748b; }
    html[data-theme="light"] .skeleton { background: linear-gradient(90deg,#e8edf3,#f8fafc,#e8edf3); background-size: 200% 100%; }
    @media (max-width: 1050px) {
      .workspace-grid { grid-template-columns: 265px 1fr; }
      .agent-panel { grid-column: 1 / -1; position: static; max-height: none; border-left: 0; border-top: 1px solid #222933; display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); }
      .agent-panel .panel-heading, .agent-panel .sessions-heading, .agent-panel .composer { grid-column: 1 / -1; }
      .provider-list { display: grid; grid-template-columns: repeat(3, 1fr); }
      .chat-history { grid-column: 1 / -1; }
    }
    @media (max-width: 720px) {
      .topbar { height: auto; grid-template-columns: 1fr; padding: 14px; gap: 12px; position: static; }
      .topbar-meta { justify-self: start; }
      .workspace-grid { display: block; }
      .explorer-panel, .agent-panel { position: static; max-height: none; }
      .file-list { max-height: 360px; }
      .metric-grid { grid-template-columns: 1fr; }
      .provider-list { grid-template-columns: 1fr; }
      .agent-panel { display: flex; }
      .architecture-card { align-items: flex-start; flex-direction: column; }
      .arch-line { width: 1px; min-width: 1px; height: 16px; margin-left: 20px; }
      .project-switcher-row { align-items: stretch; }
      .harness-flow { flex-direction: column; }
      .harness-step { flex-basis: auto; min-height: 115px; }
      .harness-arrow { transform: rotate(90deg); }
      .theme-label { display: inline; }
    }
    @media (max-width: 430px) { .theme-label { display: none; } }

    /* Agent loop page */
    :root { --lp-bg:#090e18; --lp-panel:#0e1524; --lp-raised:#131c2e; --lp-line:#24314a; --lp-ink:#e5edf9; --lp-muted:#8b9bb4; --lp-accent:#3b82f6; --lp-accent-ink:#ffffff; --lp-pass:#34d399; --lp-fail:#f87171; --lp-warn:#fbbf24; --lp-run:#60a5fa; --lp-pass-bg:rgba(52,211,153,.08); --lp-fail-bg:rgba(248,113,113,.08); --lp-run-bg:rgba(96,165,250,.08); --lp-warn-bg:rgba(251,191,36,.08); }
    html[data-theme="light"] { --lp-bg:#f4f6fa; --lp-panel:#ffffff; --lp-raised:#f5f7fb; --lp-line:#dbe2ec; --lp-ink:#172033; --lp-muted:#5d6b80; --lp-accent:#2563eb; --lp-accent-ink:#ffffff; --lp-pass:#047857; --lp-fail:#b91c1c; --lp-warn:#a16207; --lp-run:#1d4ed8; --lp-pass-bg:#ecfdf5; --lp-fail-bg:#fef2f2; --lp-run-bg:#eff6ff; --lp-warn-bg:#fffbeb; }
    .page-switch { display:flex; gap:4px; padding:3px; border:1px solid var(--lp-line); border-radius:9px; background:var(--lp-raised); }
    .page-switch button { padding:6px 12px; border:0; border-radius:7px; background:transparent; color:var(--lp-muted); font-size:.75rem; font-weight:600; cursor:pointer; }
    .page-switch button.active { background:var(--lp-panel); color:var(--lp-ink); box-shadow:inset 0 0 0 1px var(--lp-line); }
    .page-switch button:focus-visible { outline:2px solid var(--lp-accent); outline-offset:1px; }
    .lp2-grid { display:grid; grid-template-columns:250px minmax(480px,1fr) minmax(340px,400px); grid-template-rows:minmax(0,1fr); height:calc(100vh - 72px); background:var(--lp-bg); color:var(--lp-ink); font-size:14px; }
    .lp2-grid.collapsed { grid-template-columns:52px minmax(480px,1fr) minmax(340px,400px); }
    .lp2-grid button, .lp2-grid select { font:inherit; font-size:.8rem; color:var(--lp-ink); background:var(--lp-raised); border:1px solid var(--lp-line); border-radius:8px; padding:6px 11px; cursor:pointer; }
    .lp2-grid button:hover:not(:disabled) { border-color:var(--lp-muted); }
    .lp2-grid button:disabled { opacity:.5; cursor:not-allowed; }
    .lp2-grid button:focus-visible, .lp2-grid input:focus-visible, .lp2-grid textarea:focus-visible, .lp2-grid select:focus-visible, .lp2-grid summary:focus-visible { outline:2px solid var(--lp-accent); outline-offset:1px; }
    .lp2-grid .lp2-primary { background:var(--lp-accent); color:var(--lp-accent-ink); border-color:var(--lp-accent); font-weight:600; }
    .lp2-grid .lp2-danger { color:var(--lp-fail); border-color:var(--lp-fail); background:transparent; }
    .lp2-grid .lp2-ghost { background:transparent; border-color:transparent; color:var(--lp-muted); }
    .lp2-grid .lp2-ghost:hover:not(:disabled) { color:var(--lp-ink); border-color:var(--lp-line); }
    .lp2-grid .lp2-icon { padding:3px 8px; }
    .lp2-grid input, .lp2-grid textarea { font:inherit; font-size:.84rem; width:100%; color:var(--lp-ink); background:var(--lp-raised); border:1px solid var(--lp-line); border-radius:8px; padding:8px 10px; resize:vertical; }
    .lp2-mono, .lp2-pre, .lp2-line pre, .lp2-log-head { font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .lp2-hint { font-size:.74rem; color:var(--lp-muted); }
    .lp2-empty { font-size:.82rem; color:var(--lp-muted); line-height:1.55; padding:4px 0; }
    .lp2-side { background:var(--lp-panel); border-right:1px solid var(--lp-line); padding:12px 10px; overflow-y:auto; display:flex; flex-direction:column; gap:6px; }
    .lp2-side-top { display:flex; gap:6px; align-items:center; }
    .lp2-grid .lp2-new { flex:1; background:var(--lp-accent); color:var(--lp-accent-ink); border-color:var(--lp-accent); border-radius:999px; font-weight:600; padding:8px 12px; text-align:left; }
    .lp2-label { margin-top:10px; font-size:.68rem; font-weight:700; letter-spacing:.07em; text-transform:uppercase; color:var(--lp-muted); padding:0 4px; }
    .lp2-label-row { display:flex; justify-content:space-between; align-items:center; }
    .lp2-list { display:flex; flex-direction:column; gap:2px; }
    .lp2-grid .lp2-item { display:flex; flex-direction:column; align-items:flex-start; gap:1px; text-align:left; background:transparent; border-color:transparent; padding:7px 9px; }
    .lp2-grid .lp2-item.active { background:var(--lp-raised); border-color:var(--lp-line); }
    .lp2-item-title { font-size:.84rem; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .lp2-item-meta { font-size:.7rem; color:var(--lp-muted); max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .lp2-repos { display:flex; flex-direction:column; gap:8px; }
    .lp2-repo-head { display:flex; align-items:center; gap:2px; }
    .lp2-grid .lp2-repo-toggle { flex:1; min-width:0; display:flex; align-items:center; gap:6px; text-align:left; background:transparent; border-color:transparent; padding:5px 6px; color:var(--lp-muted); font-size:.76rem; font-weight:600; }
    .lp2-grid .lp2-repo-toggle:hover { color:var(--lp-ink); border-color:transparent; }
    .lp2-repo.current .lp2-repo-toggle { color:var(--lp-ink); }
    .lp2-chevron { width:12px; flex:none; font-size:.7rem; }
    .lp2-repo-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .lp2-repo-off { font-size:.66rem; font-weight:400; color:var(--lp-fail); white-space:nowrap; }
    .lp2-repo .lp2-list { padding-left:12px; }
    .lp2-grid .lp2-item-empty { color:var(--lp-muted); font-size:.78rem; }
    .lp2-import { display:flex; flex-direction:column; gap:6px; padding:0 2px; }
    .lp2-seg { display:flex; gap:4px; }
    .lp2-seg button { flex:1; }
    .lp2-grid .lp2-seg button.active { border-color:var(--lp-accent); color:var(--lp-accent); }
    .lp2-main { overflow-y:auto; padding:16px 20px 28px; display:flex; flex-direction:column; gap:14px; min-width:0; }
    .lp2-main-head { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
    .lp2-title { display:flex; align-items:center; gap:8px; flex-wrap:wrap; min-width:0; }
    .lp2-title h2 { font-size:1.15rem; font-weight:650; }
    .lp2-actions { display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
    .lp2-badge { font-size:.72rem; font-weight:600; padding:3px 9px; border-radius:999px; border:1px solid var(--lp-line); color:var(--lp-muted); background:var(--lp-raised); }
    .lp2-badge.t-pass { color:var(--lp-pass); border-color:var(--lp-pass); background:var(--lp-pass-bg); }
    .lp2-badge.t-run { color:var(--lp-run); border-color:var(--lp-run); background:var(--lp-run-bg); }
    .lp2-badge.t-fail { color:var(--lp-fail); border-color:var(--lp-fail); background:var(--lp-fail-bg); }
    .lp2-badge.t-warn { color:var(--lp-warn); border-color:var(--lp-warn); background:var(--lp-warn-bg); }
    .lp2-alert { font-size:.8rem; color:var(--lp-fail); background:var(--lp-fail-bg); border:1px solid var(--lp-fail); border-radius:10px; padding:9px 12px; white-space:pre-wrap; overflow-wrap:anywhere; }
    .lp2-alert.small { font-size:.74rem; padding:6px 9px; margin-top:4px; }
    .lp2-callout { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; font-size:.84rem; background:var(--lp-run-bg); border:1px solid var(--lp-run); border-radius:10px; padding:9px 12px; }
    .lp2-card { background:var(--lp-panel); border:1px solid var(--lp-line); border-radius:14px; padding:14px 16px; display:flex; flex-direction:column; gap:10px; min-width:0; }
    .lp2-card-head { display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; }
    .lp2-card-head h3 { font-size:.9rem; font-weight:650; }
    .lp2-current { font-size:.82rem; color:var(--lp-muted); }
    .lp2-current strong { color:var(--lp-ink); }
    .lp2-flow { list-style:none; display:flex; flex-direction:column; max-width:640px; width:100%; margin:0 auto; }
    .lp2-grid .lp2-node { width:100%; display:flex; align-items:center; gap:12px; text-align:left; padding:11px 13px; border-radius:12px; background:var(--lp-raised); }
    .lp2-grid .lp2-node.s-running { border-color:var(--lp-run); background:var(--lp-run-bg); }
    .lp2-grid .lp2-node.s-passed { border-color:var(--lp-pass); }
    .lp2-grid .lp2-node.s-failed { border-color:var(--lp-fail); background:var(--lp-fail-bg); }
    .lp2-grid .lp2-node.current { box-shadow:0 0 0 3px var(--lp-run-bg); }
    .lp2-glyph { width:36px; height:36px; flex:none; display:grid; place-items:center; border-radius:10px; font-size:.68rem; font-weight:800; letter-spacing:.02em; border:1px solid var(--lp-line); background:var(--lp-panel); color:var(--lp-muted); }
    .g-claude { color:#d97757; } .g-codex { color:#10a37f; } .g-antigravity { color:#8b5cf6; } .g-lmstudio { color:#3b82f6; } .g-ollama { color:var(--lp-muted); }
    .lp2-node-body { display:flex; flex-direction:column; gap:3px; min-width:0; flex:1; }
    .lp2-node-title { font-size:.88rem; font-weight:600; display:flex; align-items:center; gap:7px; flex-wrap:wrap; }
    .lp2-role { font-size:.66rem; font-weight:600; padding:1px 7px; border-radius:999px; border:1px solid var(--lp-line); color:var(--lp-muted); }
    .lp2-node-detail { font-size:.76rem; color:var(--lp-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .lp2-node.s-failed .lp2-node-detail { color:var(--lp-fail); }
    .lp2-pill { flex:none; font-size:.7rem; font-weight:600; padding:3px 9px; border-radius:999px; border:1px solid var(--lp-line); color:var(--lp-muted); }
    .lp2-pill.p-running { color:var(--lp-run); border-color:var(--lp-run); }
    .lp2-pill.p-passed { color:var(--lp-pass); border-color:var(--lp-pass); }
    .lp2-pill.p-failed { color:var(--lp-fail); border-color:var(--lp-fail); }
    .lp2-warn-chip { flex:none; font-size:.68rem; color:var(--lp-warn); border:1px solid var(--lp-warn); border-radius:999px; padding:2px 7px; }
    .lp2-node-open { margin:6px 0 0 48px; display:flex; flex-direction:column; gap:6px; }
    .lp2-mini { font-size:.74rem; color:var(--lp-muted); }
    .lp2-pre { white-space:pre-wrap; overflow-wrap:anywhere; font-size:.72rem; max-height:220px; overflow:auto; padding:8px 10px; border-radius:8px; background:var(--lp-raised); border:1px solid var(--lp-line); }
    .lp2-pre.fail { color:var(--lp-fail); }
    .lp2-connector { display:flex; align-items:center; gap:10px; min-height:26px; padding-left:29px; }
    .lp2-vline { display:block; flex:none; width:2px; height:22px; background:var(--lp-line); border-radius:2px; }
    .lp2-vline.done { background:var(--lp-pass); }
    .lp2-loopback { font-size:.72rem; color:var(--lp-fail); border:1px dashed var(--lp-fail); border-radius:999px; padding:2px 9px; opacity:.75; }
    .lp2-loopback.active { opacity:1; background:var(--lp-fail-bg); border-style:solid; font-weight:600; }
    .lp2-grid .lp2-ctx { display:flex; align-items:center; gap:10px; text-align:left; padding:7px 10px; border-radius:10px; font-size:.78rem; color:var(--lp-muted); }
    .lp2-grid .lp2-ctx .lp2-glyph { width:28px; height:28px; font-size:.6rem; }
    .lp2-grid .lp2-ctx > span:nth-child(2) { flex:1; min-width:0; }
    .lp2-grid .lp2-ctx.s-passed { border-color:var(--lp-pass); }
    .lp2-cards { list-style:none; display:flex; align-items:stretch; gap:0; }
    .lp2-card-item { flex:1; min-width:0; display:flex; align-items:center; }
    .lp2-grid .lp2-acard { flex:1; min-width:0; align-self:stretch; display:flex; flex-direction:column; gap:7px; text-align:left; padding:12px; border-radius:14px; border-width:2px; background:var(--lp-raised); }
    .lp2-grid .lp2-acard.s-running { border-color:var(--lp-run); background:var(--lp-run-bg); box-shadow:0 0 0 4px var(--lp-run-bg); }
    .lp2-grid .lp2-acard.s-passed { border-color:var(--lp-pass); }
    .lp2-grid .lp2-acard.s-failed { border-color:var(--lp-fail); background:var(--lp-fail-bg); box-shadow:0 0 0 4px var(--lp-fail-bg); }
    .lp2-grid .lp2-acard.selected { outline:2px solid var(--lp-accent); outline-offset:2px; }
    .lp2-acard-top { display:flex; align-items:center; gap:8px; }
    .lp2-acard-title { font-size:.88rem; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .lp2-acard-meta { display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap; }
    .lp2-acard-label { font-size:.74rem; color:var(--lp-muted); }
    .lp2-acard-box { font-size:.72rem; padding:7px 9px; border-radius:9px; background:var(--lp-panel); border:1px solid var(--lp-line); overflow-wrap:anywhere; min-height:2.6em; }
    .lp2-acard.s-failed .lp2-acard-box { color:var(--lp-fail); }
    .lp2-acard.s-passed .lp2-acard-box { color:var(--lp-pass); }
    .lp2-acard .lp2-warn-chip { align-self:flex-start; }
    .lp2-arrow { flex:none; padding:0 6px; color:var(--lp-muted); font-size:1rem; }
    .lp2-arrow.done { color:var(--lp-pass); }
    .lp2-backs { display:flex; flex-wrap:wrap; gap:6px; }
    .lp2-node-open { margin:0; padding:10px 12px; border:1px solid var(--lp-line); border-radius:10px; background:var(--lp-raised); }
    .lp2-rule.active { box-shadow:0 0 0 2px currentColor; }
    .lp2-rule.fail.active { color:var(--lp-fail); } .lp2-rule.pass.active { color:var(--lp-pass); }
    .lp2-count { font-size:.66rem; font-weight:600; margin-left:6px; padding:1px 7px; border-radius:999px; border:1px solid currentColor; }
    @media (max-width: 1350px) { .lp2-cards { flex-direction:column; } .lp2-card-item { flex-direction:column; align-items:stretch; } .lp2-arrow { align-self:center; transform:rotate(90deg); padding:4px 0; } }
    .lp2-rules { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .lp2-rule { display:flex; flex-direction:column; gap:3px; font-size:.78rem; border-radius:10px; padding:9px 11px; border:1px solid var(--lp-line); }
    .lp2-rule span { color:var(--lp-muted); line-height:1.45; }
    .lp2-rule.fail { border-color:var(--lp-fail); background:var(--lp-fail-bg); } .lp2-rule.fail strong { color:var(--lp-fail); }
    .lp2-rule.pass { border-color:var(--lp-pass); background:var(--lp-pass-bg); } .lp2-rule.pass strong { color:var(--lp-pass); }
    .lp2-others { display:flex; gap:6px; align-items:center; flex-wrap:wrap; font-size:.74rem; color:var(--lp-muted); }
    .lp2-chip { font-size:.68rem; padding:2px 8px; border-radius:999px; border:1px solid var(--lp-line); color:var(--lp-muted); background:var(--lp-raised); white-space:nowrap; }
    .lp2-chip.ghost { border-style:dashed; }
    .lp2-chip.a-available { color:var(--lp-pass); border-color:var(--lp-pass); }
    .lp2-chip.s-running { color:var(--lp-run); border-color:var(--lp-run); }
    .lp2-chip.s-passed { color:var(--lp-pass); border-color:var(--lp-pass); }
    .lp2-chip.s-blocked { color:var(--lp-fail); border-color:var(--lp-fail); }
    .lp2-chip.s-proposal { color:var(--lp-warn); border-color:var(--lp-warn); }
    .lp2-form { display:flex; flex-direction:column; gap:7px; }
    .lp2-tasks { display:flex; flex-direction:column; gap:7px; }
    .lp2-task { border:1px solid var(--lp-line); border-radius:10px; padding:10px 12px; display:flex; flex-direction:column; gap:5px; }
    .lp2-task.t-running { border-color:var(--lp-run); } .lp2-task.t-proposal { border-color:var(--lp-warn); border-style:dashed; } .lp2-task.t-canceled { opacity:.55; }
    .lp2-task-top { display:flex; align-items:center; gap:7px; flex-wrap:wrap; }
    .lp2-task-top strong { font-size:.86rem; }
    .lp2-task-actions { margin-left:auto; display:flex; gap:6px; }
    .lp2-task-desc { font-size:.78rem; color:var(--lp-muted); }
    .lp2-accept { margin:0; padding-left:18px; font-size:.76rem; color:var(--lp-muted); }
    .lp2-task-meta { display:flex; gap:10px; flex-wrap:wrap; font-size:.72rem; color:var(--lp-muted); }
    .lp2-two { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .lp2-field { display:flex; flex-direction:column; gap:4px; font-size:.74rem; color:var(--lp-muted); }
    .lp2-field code { font-size:.76rem; color:var(--lp-ink); background:var(--lp-raised); border:1px solid var(--lp-line); border-radius:8px; padding:7px 10px; overflow-wrap:anywhere; }
    .lp2-sources { list-style:none; display:flex; flex-direction:column; gap:4px; }
    .lp2-sources li { display:flex; justify-content:space-between; align-items:center; gap:6px; font-size:.78rem; background:var(--lp-raised); border:1px solid var(--lp-line); border-radius:8px; padding:4px 4px 4px 10px; overflow-wrap:anywhere; }
    .lp2-inline { display:flex; gap:6px; }
    .lp2-advanced summary { cursor:pointer; font-size:.82rem; color:var(--lp-muted); }
    .lp2-right { display:grid; grid-template-rows:minmax(0,1.35fr) minmax(0,1fr); border-left:1px solid var(--lp-line); background:var(--lp-panel); min-width:0; }
    .lp2-chat { display:flex; flex-direction:column; min-height:0; border-bottom:1px solid var(--lp-line); }
    .lp2-chat-head { display:flex; align-items:center; gap:10px; padding:12px 14px; border-bottom:1px solid var(--lp-line); }
    .lp2-chat-head div { display:flex; flex-direction:column; flex:1; }
    .lp2-chat-head strong { font-size:.88rem; }
    .lp2-dot { width:9px; height:9px; border-radius:50%; }
    .lp2-dot.ok { background:var(--lp-pass); } .lp2-dot.bad { background:var(--lp-fail); }
    .lp2-messages { flex:1; min-height:0; overflow-y:auto; padding:12px 14px; display:flex; flex-direction:column; gap:10px; }
    .lp2-msg { max-width:92%; padding:9px 11px; border-radius:12px; background:var(--lp-raised); border:1px solid var(--lp-line); }
    .lp2-msg.me { align-self:flex-end; background:var(--lp-run-bg); border-color:transparent; }
    .lp2-msg.err { border-color:var(--lp-fail); }
    .lp2-msg.live { border-style:dashed; }
    .lp2-msg p { white-space:pre-wrap; font-size:.84rem; line-height:1.55; overflow-wrap:anywhere; }
    .lp2-msg-meta { font-size:.68rem; color:var(--lp-muted); margin-bottom:3px; }
    .lp2-suggest { display:flex; gap:6px; flex-wrap:wrap; padding:0 14px 8px; }
    .lp2-grid .lp2-chip-btn { font-size:.72rem; padding:4px 10px; border-radius:999px; }
    .lp2-grid .lp2-chip-btn.strong { border-color:var(--lp-accent); color:var(--lp-accent); }
    .lp2-composer { display:flex; gap:8px; align-items:flex-end; padding:0 14px 12px; }
    .lp2-log { display:flex; flex-direction:column; min-height:0; }
    .lp2-log-head { display:flex; justify-content:space-between; gap:8px; font-size:.72rem; color:var(--lp-muted); padding:9px 14px; border-bottom:1px solid var(--lp-line); }
    .lp2-log-body { flex:1; min-height:0; overflow-y:auto; padding:8px 14px 12px; display:flex; flex-direction:column; gap:3px; }
    .lp2-line { display:grid; grid-template-columns:58px auto 1fr; gap:6px; align-items:baseline; font-size:.72rem; }
    .lp2-line time { color:var(--lp-muted); }
    .lp2-who { color:var(--lp-muted); font-weight:700; white-space:nowrap; }
    .lp2-line pre { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; grid-column:3; }
    .lp2-line.l-output pre { color:var(--lp-muted); max-height:140px; overflow:auto; }
    .lp2-line.l-pass pre { color:var(--lp-pass); } .lp2-line.l-fail pre { color:var(--lp-fail); } .lp2-line.l-warn pre { color:var(--lp-warn); }
    @media (max-width: 1200px) {
      .lp2-grid { grid-template-columns:210px minmax(0,1fr) 330px; }
      .lp2-grid.collapsed { grid-template-columns:52px minmax(0,1fr) 330px; }
    }
    @media (max-width: 900px) {
      .lp2-grid, .lp2-grid.collapsed { grid-template-columns:1fr; grid-template-rows:auto; height:auto; }
      .lp2-side { border-right:0; border-bottom:1px solid var(--lp-line); max-height:none; }
      .lp2-right { border-left:0; grid-template-rows:auto auto; }
      .lp2-messages { max-height:55vh; }
      .lp2-log-body { max-height:50vh; }
      .lp2-two, .lp2-rules { grid-template-columns:1fr; }
      .lp2-main { overflow:visible; padding:14px 16px; }
    }
  </style>
</head>
<body>
  <div id="root">
    <div style="display: flex; justify-content: center; align-items: center; height: 80vh;">
      <div class="badge badge-blue" style="font-size: 1rem; padding: 12px 24px;">Loading Harness Atlas...</div>
    </div>
  </div>
  <script src="/bundle.js"></script>
</body>
</html>`;
}

function parsePortValue(val: string, flag: string): number {
  const trimmed = val.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    throw new Error(
      `Invalid port value for ${flag}: "${val}". Port must be a valid integer between 0 and 65535.`,
    );
  }
  const num = Number(trimmed);
  if (!Number.isSafeInteger(num) || num < 0 || num > 65535) {
    throw new Error(
      `Invalid port number for ${flag}: ${num}. Port must be between 0 and 65535.`,
    );
  }
  return num;
}

export function parseDashboardCliArgs(args: string[]): DashboardOptions {
  const options: DashboardOptions = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--workspace" || arg === "-w") {
      if (i + 1 >= args.length || args[i + 1].startsWith("-")) {
        throw new Error(`Missing value for flag ${arg}`);
      }
      const val = args[++i];
      if (!val || !val.trim()) {
        throw new Error(`Value for flag ${arg} cannot be empty`);
      }
      options.workspaceRoot = val;
    } else if (arg.startsWith("--workspace=")) {
      const val = arg.slice("--workspace=".length);
      if (!val || !val.trim()) {
        throw new Error("Value for flag --workspace cannot be empty");
      }
      options.workspaceRoot = val;
    } else if (arg.startsWith("-w=")) {
      const val = arg.slice("-w=".length);
      if (!val || !val.trim()) {
        throw new Error("Value for flag -w cannot be empty");
      }
      options.workspaceRoot = val;
    } else if (arg === "--port" || arg === "-p") {
      if (i + 1 >= args.length || args[i + 1].startsWith("-")) {
        throw new Error(`Missing value for flag ${arg}`);
      }
      const val = args[++i];
      if (!val || !val.trim()) {
        throw new Error(`Value for flag ${arg} cannot be empty`);
      }
      options.port = parsePortValue(val, arg);
    } else if (arg.startsWith("--port=")) {
      const val = arg.slice("--port=".length);
      if (!val || !val.trim()) {
        throw new Error("Value for flag --port cannot be empty");
      }
      options.port = parsePortValue(val, "--port");
    } else if (arg.startsWith("-p=")) {
      const val = arg.slice("-p=".length);
      if (!val || !val.trim()) {
        throw new Error("Value for flag -p cannot be empty");
      }
      options.port = parsePortValue(val, "-p");
    } else if (arg === "--registry" || arg === "-r") {
      if (i + 1 >= args.length || args[i + 1].startsWith("-")) {
        throw new Error(`Missing value for flag ${arg}`);
      }
      const val = args[++i];
      if (!val || !val.trim()) {
        throw new Error(`Value for flag ${arg} cannot be empty`);
      }
      options.registryPath = val;
    } else if (arg.startsWith("--registry=")) {
      const val = arg.slice("--registry=".length);
      if (!val || !val.trim()) {
        throw new Error("Value for flag --registry cannot be empty");
      }
      options.registryPath = val;
    } else if (arg.startsWith("-r=")) {
      const val = arg.slice("-r=".length);
      if (!val || !val.trim()) {
        throw new Error("Value for flag -r cannot be empty");
      }
      options.registryPath = val;
    } else {
      throw new Error(`Unknown or invalid argument: "${arg}"`);
    }
  }
  return options;
}

export function createDashboardServer(options: DashboardOptions = {}) {
  const rawWorkspace =
    options.workspaceRoot ??
    process.env.CONTINUITY_WORKSPACE_PATH ??
    process.cwd();
  const workspaceRoot = resolve(rawWorkspace);

  if (!existsSync(workspaceRoot)) {
    throw new Error(`Workspace directory does not exist: ${workspaceRoot}`);
  }
  try {
    if (!statSync(workspaceRoot).isDirectory()) {
      throw new Error(`Workspace path is not a directory: ${workspaceRoot}`);
    }
  } catch (err: any) {
    if (err.message.includes("is not a directory")) throw err;
    throw new Error(`Cannot access workspace directory: ${workspaceRoot}`);
  }

  let port: number;
  if (options.port !== undefined) {
    if (
      typeof options.port !== "number" ||
      !Number.isSafeInteger(options.port) ||
      options.port < 0 ||
      options.port > 65535
    ) {
      throw new Error(
        `Invalid port: ${options.port}. Port must be an integer between 0 and 65535.`,
      );
    }
    port = options.port;
  } else if (process.env.PORT !== undefined) {
    port = parsePortValue(process.env.PORT, "PORT environment variable");
  } else {
    port = 3456;
  }
  const statePath = resolve(
    workspaceRoot,
    process.env.CONTINUITY_STATE_PATH ?? ".continuity/state.json",
  );
  const isExplicitRegistry = Boolean(
    options.registryPath ?? process.env.CONTINUITY_REGISTRY_PATH,
  );
  const rawRegistryPath =
    options.registryPath ??
    process.env.CONTINUITY_REGISTRY_PATH ??
    join(workspaceRoot, ".continuity", "workspaces.json");
  const configuredRegistry = loadWorkspaceRegistry(
    rawRegistryPath,
    workspaceRoot,
    port,
    isExplicitRegistry,
  );
  const localRegistryPath = join(
    workspaceRoot,
    ".continuity",
    "workspaces.local.json",
  );
  const getRegistry = (): RegisteredWorkspace[] =>
    mergeWorkspaceRegistries(
      configuredRegistry,
      loadUserWorkspaceRegistry(localRegistryPath),
    );
  const activeAntigravityRuns = new Map<string, AbortController>();
  const loopStateRoot = join(workspaceRoot, ".continuity", "harness");
  const loopEngine = new LoopEngine({
    stateRoot: loopStateRoot,
    agentConfigPath: process.env.HARNESS_AGENT_CONFIG ?? join(loopStateRoot, "agents.json"),
  });

  const getTargetWorkspace = (
    workspaceId?: string | null,
  ): { root: string; summary?: RegisteredWorkspace } => {
    if (!workspaceId) {
      return { root: workspaceRoot };
    }
    const match = getRegistry().find((w) => w.id === workspaceId);
    if (!match) {
      throw new Error("UNREGISTERED");
    }
    const canonicalRoot = resolve(match.path);
    if (!existsSync(canonicalRoot) || !statSync(canonicalRoot).isDirectory()) {
      throw new Error("UNAVAILABLE");
    }
    return { root: canonicalRoot, summary: match };
  };

  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const parsedUrl = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? "localhost"}`,
      );
      const pathname = parsedUrl.pathname;

      // The agent loop has its own same-origin checks and writes only inside run worktrees.
      if (await handleLoopRequest(req, res, parsedUrl, {
        engine: loopEngine,
        localRegistryPath,
        getTargetWorkspace,
        readJson: readJsonRequest,
      })) return;

      // Helper to send JSON without wildcard CORS
      const sendJson = (data: unknown, status = 200) => {
        res.writeHead(status, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify(data, null, 2));
      };

      // Helper to send text/html/js without wildcard CORS
      const sendContent = (
        content: string | Buffer,
        status = 200,
        contentType = "text/html; charset=utf-8",
      ) => {
        res.writeHead(status, {
          "Content-Type": contentType,
        });
        res.end(content);
      };

      // Project contents remain read-only. POST is limited to local Harness
      // metadata and bounded context assembly; all other mutations are rejected.
      const allowedPostPaths = new Set([
        "/api/sessions",
        "/api/context-packet",
        "/api/workspaces/pick",
        "/api/workspaces/register",
        "/api/antigravity/test",
        "/api/antigravity/run",
        "/api/antigravity/cancel",
      ]);
      if (
        req.method !== "GET" &&
        req.method !== "HEAD" &&
        !(req.method === "POST" && allowedPostPaths.has(pathname))
      ) {
        return sendJson(
          { error: "Method not allowed: project files are read-only" },
          405,
        );
      }

      // 1. GET /api/health
      if (pathname === "/api/health") {
        return sendJson({ status: "ok", timestamp: new Date().toISOString() });
      }

      // 2. GET /api/workspaces (Registry list & status summary)
      if (pathname === "/api/workspaces") {
        const summaries = await getWorkspacesSummaryList(getRegistry());
        return sendJson({ workspaces: summaries });
      }

      if (pathname === "/api/workspaces/pick") {
        try {
          const picked = await pickWindowsWorkspaceFolder();
          if (picked.canceled || !picked.path) return sendJson({ canceled: true });
          const registered = registerUserWorkspace(localRegistryPath, picked.path);
          return sendJson({ canceled: false, ...registered }, registered.created ? 201 : 200);
        } catch (err: any) {
          if (err?.message === "PICKER_UNSUPPORTED") {
            return sendJson({ error: "Native folder picker is unavailable", fallback: "path" }, 501);
          }
          if (err?.message === "PICKER_TIMEOUT") return sendJson({ error: "Folder picker timed out" }, 408);
          return sendJson({ error: "Could not open the local folder picker", fallback: "path" }, 500);
        }
      }

      if (pathname === "/api/workspaces/register") {
        try {
          const body = await readJsonRequest(req, 32_000);
          const registered = registerUserWorkspace(
            localRegistryPath,
            typeof body.path === "string" ? body.path : "",
            typeof body.name === "string" ? body.name : undefined,
          );
          return sendJson(registered, registered.created ? 201 : 200);
        } catch (err: any) {
          if (err?.message === "INVALID_JSON") return sendJson({ error: "Invalid JSON body" }, 400);
          if (err?.message === "REQUEST_TOO_LARGE") return sendJson({ error: "Request body is too large" }, 413);
          if (["INVALID_WORKSPACE_PATH", "WORKSPACE_PATH_NOT_ABSOLUTE", "WORKSPACE_NOT_FOUND", "WORKSPACE_NOT_DIRECTORY", "WORKSPACE_UNAVAILABLE"].includes(err?.message)) {
            return sendJson({ error: "Choose an existing local directory" }, 400);
          }
          return sendJson({ error: err?.message || "Workspace registration failed" }, 500);
        }
      }

      // 3. GET /api/state
      if (pathname === "/api/state") {
        try {
          const wsParam = parsedUrl.searchParams.get("workspace");
          let targetRoot = workspaceRoot;
          if (wsParam) {
            try {
              const resolved = getTargetWorkspace(wsParam);
              targetRoot = resolved.root;
            } catch (e: any) {
              if (e.message === "UNREGISTERED") {
                return sendJson(
                  {
                    error:
                      "Access denied: Workspace is not in registered allowlist",
                  },
                  403,
                );
              }
              return sendJson(
                {
                  error:
                    "Target workspace is unavailable or directory is missing",
                },
                404,
              );
            }
          }
          const targetStatePath = wsParam
            ? resolve(targetRoot, ".continuity", "state.json")
            : statePath;
          if (!isPathContained(targetRoot, targetStatePath)) {
            return sendJson(
              { error: "Access denied: State path is outside workspace" },
              403,
            );
          }
          if (existsSync(targetStatePath)) {
            const raw = JSON.parse(readFileSync(targetStatePath, "utf8"));
            return sendJson(raw);
          }
          return sendJson({
            projectId: wsParam || "default",
            currentChangeId: null,
            stage: "IDLE",
            tasks: [],
            checkpoints: [],
            blockers: [],
            decisions: [],
          });
        } catch (err: any) {
          return sendJson(
            { error: err?.message || "Failed to read state" },
            500,
          );
        }
      }

      // 4. GET /api/timeline
      if (pathname === "/api/timeline") {
        try {
          const wsParam = parsedUrl.searchParams.get("workspace");
          let targetRoot = workspaceRoot;
          if (wsParam) {
            try {
              const resolved = getTargetWorkspace(wsParam);
              targetRoot = resolved.root;
            } catch (e: any) {
              if (e.message === "UNREGISTERED") {
                return sendJson(
                  {
                    error:
                      "Access denied: Workspace is not in registered allowlist",
                  },
                  403,
                );
              }
              return sendJson(
                {
                  error:
                    "Target workspace is unavailable or directory is missing",
                },
                404,
              );
            }
          }
          const targetStatePath = wsParam
            ? resolve(targetRoot, ".continuity", "state.json")
            : statePath;
          if (!isPathContained(targetRoot, targetStatePath)) {
            return sendJson(
              { error: "Access denied: State path is outside workspace" },
              403,
            );
          }

          const rawLimit = parsedUrl.searchParams.get("limit");
          let limit = 20;
          if (rawLimit !== null) {
            const parsed = Number(rawLimit);
            if (Number.isSafeInteger(parsed)) {
              limit = parsed;
            }
          }

          if (existsSync(targetStatePath)) {
            try {
              const raw = JSON.parse(readFileSync(targetStatePath, "utf8"));
              const events = extractWorkflowTimeline(raw, limit);
              return sendJson({ events });
            } catch {
              return sendJson({ events: [] });
            }
          }
          return sendJson({ events: [] });
        } catch (err: any) {
          return sendJson(
            { error: err?.message || "Failed to read timeline" },
            500,
          );
        }
      }

      // 5. GET /api/git
      if (pathname === "/api/git") {
        const wsParam = parsedUrl.searchParams.get("workspace");
        let targetRoot = workspaceRoot;
        if (wsParam) {
          try {
            const resolved = getTargetWorkspace(wsParam);
            targetRoot = resolved.root;
          } catch (e: any) {
            if (e.message === "UNREGISTERED") {
              return sendJson(
                {
                  error:
                    "Access denied: Workspace is not in registered allowlist",
                },
                403,
              );
            }
            return sendJson({ error: "Target workspace is unavailable" }, 404);
          }
        }
        const summary = getGitSummary(targetRoot);
        return sendJson(summary);
      }

      // 6. GET /api/artifacts
      if (pathname === "/api/artifacts") {
        const wsParam = parsedUrl.searchParams.get("workspace");
        let targetRoot = workspaceRoot;
        if (wsParam) {
          try {
            const resolved = getTargetWorkspace(wsParam);
            targetRoot = resolved.root;
          } catch (e: any) {
            if (e.message === "UNREGISTERED") {
              return sendJson(
                {
                  error:
                    "Access denied: Workspace is not in registered allowlist",
                },
                403,
              );
            }
            return sendJson({ error: "Target workspace is unavailable" }, 404);
          }
        }

        const requestedPath = parsedUrl.searchParams.get("path");
        if (!requestedPath) {
          // List allowlisted artifacts
          const artifacts = getAllowlistedArtifactsList(targetRoot);
          return sendJson({ artifacts });
        }

        // Security check: Segment-aware containment and allowlist
        const targetPath = join(targetRoot, requestedPath);
        if (!isAllowlistedArtifact(targetRoot, targetPath)) {
          return sendJson(
            {
              error:
                "Access denied: Path is outside workspace or not allowlisted",
            },
            403,
          );
        }

        if (!existsSync(targetPath) || statSync(targetPath).isDirectory()) {
          return sendJson({ error: "Artifact not found" }, 404);
        }

        try {
          const content = readFileSync(targetPath, "utf8");
          return sendContent(content, 200, "text/plain; charset=utf-8");
        } catch (err: any) {
          return sendJson(
            { error: err?.message || "Failed to read artifact" },
            500,
          );
        }
      }

      // 7. GET /api/project-index
      if (pathname === "/api/project-index") {
        const wsParam = parsedUrl.searchParams.get("workspace");
        try {
          const target = getTargetWorkspace(wsParam);
          return sendJson(buildProjectIndex(target.root));
        } catch (err: any) {
          if (err?.message === "UNREGISTERED") {
            return sendJson({ error: "Workspace is not registered" }, 403);
          }
          if (err?.message === "UNAVAILABLE") {
            return sendJson({ error: "Workspace is unavailable" }, 404);
          }
          return sendJson({ error: err?.message || "Index failed" }, 500);
        }
      }

      // 8. GET /api/project-file
      if (pathname === "/api/project-file") {
        const wsParam = parsedUrl.searchParams.get("workspace");
        const requestedPath = parsedUrl.searchParams.get("path");
        if (!requestedPath) return sendJson({ error: "Missing path" }, 400);
        try {
          const target = getTargetWorkspace(wsParam);
          return sendJson(readSafeProjectFile(target.root, requestedPath));
        } catch (err: any) {
          if (err?.message === "UNREGISTERED" || err?.message === "UNSAFE_PATH") {
            return sendJson({ error: "Access denied" }, 403);
          }
          if (err?.message === "UNAVAILABLE") {
            return sendJson({ error: "Workspace is unavailable" }, 404);
          }
          return sendJson({ error: err?.message || "File read failed" }, 500);
        }
      }

      // 9. GET /api/relationships
      if (pathname === "/api/relationships") {
        const wsParam = parsedUrl.searchParams.get("workspace");
        const requestedPath = parsedUrl.searchParams.get("path");
        if (!requestedPath) return sendJson({ error: "Missing path" }, 400);
        try {
          const target = getTargetWorkspace(wsParam);
          return sendJson({
            relationships: extractFileRelationships(target.root, requestedPath),
          });
        } catch (err: any) {
          if (err?.message === "UNREGISTERED" || err?.message === "UNSAFE_PATH") {
            return sendJson({ error: "Access denied" }, 403);
          }
          if (err?.message === "UNAVAILABLE") {
            return sendJson({ error: "Workspace is unavailable" }, 404);
          }
          return sendJson({ relationships: [] });
        }
      }

      if (pathname === "/api/project-flow") {
        const wsParam = parsedUrl.searchParams.get("workspace");
        try {
          const target = getTargetWorkspace(wsParam);
          return sendJson({ flow: buildProjectFlow(target.root) });
        } catch (err: any) {
          if (err?.message === "UNREGISTERED") return sendJson({ error: "Workspace is not registered" }, 403);
          if (err?.message === "UNAVAILABLE") return sendJson({ error: "Workspace is unavailable" }, 404);
          return sendJson({ error: err?.message || "Project flow failed" }, 500);
        }
      }

      if (pathname === "/api/harness-flow") {
        const wsParam = parsedUrl.searchParams.get("workspace");
        try {
          const target = getTargetWorkspace(wsParam);
          const providers = await discoverProviderStates();
          const antigravity = providers.find((provider) => provider.id === "antigravity");
          let stage = "IDLE";
          const targetStatePath = join(target.root, ".continuity", "state.json");
          if (existsSync(targetStatePath)) {
            try { stage = JSON.parse(readFileSync(targetStatePath, "utf8")).stage || "IDLE"; } catch {}
          }
          const checkpointActive = stage === "CHECKPOINT_1" || stage === "CHECKPOINT_2";
          return sendJson({
            steps: [
              { id: "workspace", label: "Workspace", status: "complete", detail: target.root },
              { id: "index", label: "Safe index", status: "complete", detail: "Secret, binary, vendor, and generated paths filtered" },
              { id: "context", label: "Selected context", status: "current", detail: "Choose safe files and write a prompt" },
              {
                id: "provider",
                label: "Provider route",
                status: antigravity?.status === "available" ? "ready" : "unavailable",
                detail: antigravity?.detail || "No provider available",
              },
              { id: "proposal", label: "Proposal / diff", status: "future", detail: "Antigravity output remains review-only" },
              {
                id: "checkpoint",
                label: "Human checkpoint",
                status: checkpointActive ? "current" : "future",
                detail: checkpointActive ? `Workflow stage: ${stage}` : "Required before application",
              },
              { id: "apply", label: "Apply later", status: "disabled", detail: "Direct application is not enabled in this change" },
            ],
          });
        } catch (err: any) {
          if (err?.message === "UNREGISTERED") return sendJson({ error: "Workspace is not registered" }, 403);
          if (err?.message === "UNAVAILABLE") return sendJson({ error: "Workspace is unavailable" }, 404);
          return sendJson({ error: err?.message || "Harness flow failed" }, 500);
        }
      }

      // 10. GET /api/providers
      if (pathname === "/api/providers") {
        return sendJson({ providers: await discoverProviderStates() });
      }

      // 11. GET/POST /api/sessions (local metadata only)
      if (pathname === "/api/sessions") {
        const wsParam = parsedUrl.searchParams.get("workspace");
        try {
          const target = getTargetWorkspace(wsParam);
          const workspaceId = wsParam || "default";
          if (req.method === "POST") {
            const body = await readJsonRequest(req);
            const session = createHarnessSession(
              target.root,
              workspaceId,
              typeof body.title === "string" ? body.title : "New session",
              (typeof body.mode === "string" ? body.mode : "auto") as OrchestrationMode,
            );
            return sendJson({ session }, 201);
          }
          return sendJson({
            sessions: loadHarnessSessions(target.root, workspaceId),
          });
        } catch (err: any) {
          if (err?.message === "UNREGISTERED") {
            return sendJson({ error: "Workspace is not registered" }, 403);
          }
          if (err?.message === "UNAVAILABLE") {
            return sendJson({ error: "Workspace is unavailable" }, 404);
          }
          if (err?.message === "INVALID_JSON") {
            return sendJson({ error: "Invalid JSON body" }, 400);
          }
          if (err?.message === "REQUEST_TOO_LARGE") {
            return sendJson({ error: "Request body is too large" }, 413);
          }
          if (err?.message === "INVALID_MODE") {
            return sendJson({ error: "Unsupported orchestration mode" }, 400);
          }
          return sendJson({ error: err?.message || "Session operation failed" }, 500);
        }
      }

      // 12. POST /api/context-packet (does not invoke a model or write project files)
      if (pathname === "/api/context-packet") {
        if (req.method !== "POST") {
          return sendJson({ error: "Use POST for context packet assembly" }, 405);
        }
        const wsParam = parsedUrl.searchParams.get("workspace");
        try {
          const target = getTargetWorkspace(wsParam);
          const body = await readJsonRequest(req);
          const packet = buildContextPacket(target.root, wsParam || "default", {
            prompt: typeof body.prompt === "string" ? body.prompt : "",
            selectedPaths: Array.isArray(body.selectedPaths)
              ? body.selectedPaths.filter((value: unknown) => typeof value === "string")
              : [],
            mode: (typeof body.mode === "string" ? body.mode : "auto") as OrchestrationMode,
          });
          return sendJson({ packet });
        } catch (err: any) {
          if (err?.message === "UNREGISTERED" || err?.message === "UNSAFE_PATH") {
            return sendJson({ error: "Access denied" }, 403);
          }
          if (err?.message === "INVALID_JSON") {
            return sendJson({ error: "Invalid JSON body" }, 400);
          }
          if (err?.message === "REQUEST_TOO_LARGE") {
            return sendJson({ error: "Request body is too large" }, 413);
          }
          return sendJson({ error: err?.message || "Context assembly failed" }, 500);
        }
      }

      if (pathname === "/api/antigravity/test") {
        const wsParam = parsedUrl.searchParams.get("workspace");
        try {
          const target = getTargetWorkspace(wsParam);
          const packet = buildContextPacket(target.root, wsParam || "default", {
            prompt: "Reply with exactly: HARNESS_READY",
            selectedPaths: [],
            mode: "antigravity",
            maxCharacters: 8_000,
          });
          const result = await runAntigravity(packet, {
            timeoutMs: 90_000,
            runtimeRoot: join(workspaceRoot, ".continuity", "runtime", "agy"),
          });
          return sendJson({ result });
        } catch (err: any) {
          if (err?.message === "ANTIGRAVITY_NOT_INSTALLED") return sendJson({ error: "Antigravity CLI is not installed" }, 404);
          if (err?.message === "ANTIGRAVITY_TIMEOUT") return sendJson({ error: "Antigravity connection test timed out" }, 504);
          return sendJson({ error: err?.message || "Antigravity connection test failed" }, 500);
        }
      }

      if (pathname === "/api/antigravity/cancel") {
        try {
          const body = await readJsonRequest(req, 8_000);
          const runId = typeof body.runId === "string" ? body.runId : "";
          const controller = activeAntigravityRuns.get(runId);
          if (!controller) return sendJson({ canceled: false, error: "Run is not active" }, 404);
          controller.abort();
          return sendJson({ canceled: true });
        } catch (err: any) {
          return sendJson({ error: err?.message || "Cancellation failed" }, 400);
        }
      }

      if (pathname === "/api/antigravity/run") {
        const wsParam = parsedUrl.searchParams.get("workspace");
        let runId = "";
        try {
          const target = getTargetWorkspace(wsParam);
          const body = await readJsonRequest(req);
          runId = typeof body.runId === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(body.runId)
            ? body.runId
            : `run-${Date.now()}`;
          if (activeAntigravityRuns.has(runId)) return sendJson({ error: "Run id is already active" }, 409);
          const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
          const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
          if (!sessionId || !prompt) return sendJson({ error: "Session and prompt are required" }, 400);
          const workspaceId = wsParam || "default";
          let session = loadHarnessSessions(target.root, workspaceId).find((item) => item.id === sessionId);
          if (!session) return sendJson({ error: "Session was not found in this workspace" }, 404);
          const packet = buildContextPacket(target.root, workspaceId, {
            prompt,
            selectedPaths: Array.isArray(body.selectedPaths)
              ? body.selectedPaths.filter((value: unknown) => typeof value === "string")
              : [],
            mode: "antigravity",
            maxCharacters: 60_000,
          });
          session = updateHarnessSession(target.root, workspaceId, sessionId, (current) => ({
            ...current,
            messages: [
              ...(current.messages ?? []),
              { id: `user-${runId}`, role: "user", content: prompt, createdAt: new Date().toISOString() },
            ],
          }));
          const controller = new AbortController();
          activeAntigravityRuns.set(runId, controller);
          const result = await runAntigravity(packet, {
            conversationId: session.providerConversations?.antigravity,
            signal: controller.signal,
            timeoutMs: 180_000,
            runtimeRoot: join(workspaceRoot, ".continuity", "runtime", "agy"),
          });
          const updated = updateHarnessSession(target.root, workspaceId, sessionId, (current) => ({
            ...current,
            providerConversations: result.conversationId
              ? { ...(current.providerConversations ?? {}), antigravity: result.conversationId }
              : current.providerConversations,
            messages: [
              ...(current.messages ?? []),
              {
                id: `assistant-${runId}`,
                role: "assistant",
                provider: "antigravity",
                content: result.response || result.error || result.status,
                createdAt: new Date().toISOString(),
                usage: result.usage as Record<string, number> | undefined,
                error: result.error,
              },
            ],
            proposals: [
              ...(current.proposals ?? []),
              ...result.proposals.map((proposal, index) => ({
                ...proposal,
                id: `${runId}-${index}`,
                provider: "antigravity" as const,
                createdAt: new Date().toISOString(),
              })),
            ],
          }));
          return sendJson({ runId, result, session: updated });
        } catch (err: any) {
          if (err?.message === "UNREGISTERED" || err?.message === "UNSAFE_PATH") return sendJson({ error: "Access denied" }, 403);
          if (err?.message === "ANTIGRAVITY_NOT_INSTALLED") return sendJson({ error: "Antigravity CLI is not installed" }, 404);
          if (err?.message === "ANTIGRAVITY_TIMEOUT") return sendJson({ error: "Antigravity timed out" }, 504);
          if (err?.message === "ANTIGRAVITY_OUTPUT_LIMIT") return sendJson({ error: "Antigravity output exceeded the safety limit" }, 413);
          if (err?.message === "SESSION_NOT_FOUND") return sendJson({ error: "Session was not found in this workspace" }, 404);
          return sendJson({ error: err?.message || "Antigravity run failed" }, 500);
        } finally {
          if (runId) activeAntigravityRuns.delete(runId);
        }
      }

      // GET /bundle.js (Local offline React bundle from fixed installation path)
      if (pathname === "/bundle.js" || pathname === "/dist/public/bundle.js") {
        const moduleDir = dirname(fileURLToPath(import.meta.url));
        const candidates = [
          join(moduleDir, "public", "bundle.js"),
          resolve(moduleDir, "..", "dist", "public", "bundle.js"),
        ];
        const bundlePath = candidates.find((p) => existsSync(p));
        if (bundlePath) {
          try {
            const js = readFileSync(bundlePath, "utf8");
            return sendContent(
              js,
              200,
              "application/javascript; charset=utf-8",
            );
          } catch (err: any) {
            return sendJson({ error: "Failed to read bundle" }, 500);
          }
        }
        return sendJson(
          { error: "Bundle not found. Run npm run build first." },
          404,
        );
      }

      // 14. GET / or UI route
      if (pathname === "/" || pathname === "/index.html") {
        const html = getDashboardHtml();
        return sendContent(html, 200, "text/html; charset=utf-8");
      }

      // Fallback 404
      return sendJson({ error: "Not found" }, 404);
    },
  );

  return {
    server,
    port,
    workspaceRoot,
    registry: getRegistry(),
    start: () =>
      new Promise<number>((resolvePromise, reject) => {
        // Bind strictly to 127.0.0.1
        server.listen(port, "127.0.0.1", () => {
          const address = server.address();
          const actualPort =
            typeof address === "object" && address ? address.port : port;
          resolvePromise(actualPort);
        });
        server.on("error", reject);
      }),
    loopEngine,
    stop: () => {
      loopEngine.stopAll();
      for (const controller of activeAntigravityRuns.values()) controller.abort();
      activeAntigravityRuns.clear();
      return new Promise<void>((resolvePromise, reject) => {
        server.close((err) => (err ? reject(err) : resolvePromise()));
      });
    },
  };
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  try {
    const cliOptions = parseDashboardCliArgs(process.argv.slice(2));
    const dashboard = createDashboardServer(cliOptions);
    dashboard
      .start()
      .then((actualPort) => {
        console.log(
          `[Continuity Dashboard] Running on http://127.0.0.1:${actualPort} (workspace: ${dashboard.workspaceRoot})`,
        );
      })
      .catch((err: any) => {
        console.error(
          `[Continuity Dashboard Error] ${err?.message || String(err)}`,
        );
        process.exit(1);
      });
  } catch (err: any) {
    console.error(
      `[Continuity Dashboard Error] ${err?.message || String(err)}`,
    );
    process.exit(1);
  }
}
