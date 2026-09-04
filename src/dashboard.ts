import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";

export interface RegisteredWorkspace {
  id: string;
  name: string;
  path: string;
  port?: number;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  path: string;
  port?: number;
  status: "ACTIVE" | "UNAVAILABLE";
  error?: string;
  stage?: string;
  currentChangeId?: string | null;
  tasksCount?: number;
  blockersCount?: number;
  gitClean?: boolean;
}

export interface DashboardOptions {
  workspaceRoot?: string;
  port?: number;
  registryPath?: string;
}

const ALLOWLISTED_PREFIXES = ["openspec", "reports", "tasks", ".continuity"];

export function isPathContained(workspaceRoot: string, targetPath: string): boolean {
  const root = resolve(workspaceRoot);
  const target = resolve(targetPath);
  if (root === target) return true;
  const rel = relative(root, target);
  return Boolean(rel && !rel.startsWith("..") && !isAbsolute(rel));
}

export function isAllowlistedArtifact(workspaceRoot: string, targetPath: string): boolean {
  if (!isPathContained(workspaceRoot, targetPath)) return false;
  const rel = relative(resolve(workspaceRoot), resolve(targetPath)).replace(/\\/g, "/");
  return ALLOWLISTED_PREFIXES.some(prefix => rel === prefix || rel.startsWith(prefix + "/"));
}

export function getGitSummary(workspaceRoot: string): { branch: string; clean: boolean; modifiedFiles: string[] } {
  try {
    const branch = execSync("git branch --show-current", {
      cwd: workspaceRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const statusOut = execSync("git status --porcelain", {
      cwd: workspaceRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const modifiedFiles = statusOut
      ? statusOut
          .split("\n")
          .map(line => line.trim())
          .filter(Boolean)
      : [];
    return {
      branch: branch || "main",
      clean: modifiedFiles.length === 0,
      modifiedFiles
    };
  } catch {
    return { branch: "unknown", clean: true, modifiedFiles: [] };
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

export function validateWorkspaceRegistryData(raw: any, sourcePath = "registry", defaultPort = 3456): RegisteredWorkspace[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Invalid registry format in ${sourcePath}: Root must be an object.`);
  }
  if (!Array.isArray(raw.workspaces)) {
    throw new Error(`Invalid registry format in ${sourcePath}: Missing "workspaces" array.`);
  }
  if (raw.workspaces.length === 0) {
    throw new Error(`Invalid registry format in ${sourcePath}: "workspaces" array cannot be empty.`);
  }

  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  const results: RegisteredWorkspace[] = [];

  for (let i = 0; i < raw.workspaces.length; i++) {
    const entry = raw.workspaces[i];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Invalid workspace entry at index ${i} in ${sourcePath}: Entry must be an object.`);
    }

    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id) {
      throw new Error(`Invalid workspace entry at index ${i} in ${sourcePath}: "id" must be a non-empty string.`);
    }
    if (seenIds.has(id)) {
      throw new Error(`Duplicate workspace id "${id}" found at index ${i} in ${sourcePath}.`);
    }
    seenIds.add(id);

    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (!name) {
      throw new Error(`Invalid workspace entry "${id}" in ${sourcePath}: "name" must be a non-empty string.`);
    }

    const rawPath = typeof entry.path === "string" ? entry.path.trim() : "";
    if (!rawPath) {
      throw new Error(`Invalid workspace entry "${id}" in ${sourcePath}: "path" must be a non-empty string.`);
    }
    const canonicalPath = resolve(rawPath);
    if (seenPaths.has(canonicalPath)) {
      throw new Error(`Duplicate workspace path "${canonicalPath}" found for entry "${id}" in ${sourcePath}.`);
    }
    seenPaths.add(canonicalPath);

    let port = defaultPort;
    if (entry.port !== undefined) {
      if (typeof entry.port !== "number" || !Number.isSafeInteger(entry.port) || entry.port < 0 || entry.port > 65535) {
        throw new Error(`Invalid port for workspace "${id}" in ${sourcePath}: ${entry.port}. Port must be an integer between 0 and 65535.`);
      }
      port = entry.port;
    }

    results.push({
      id,
      name,
      path: canonicalPath,
      port
    });
  }

  return results;
}

export function loadWorkspaceRegistry(
  registryPath: string,
  defaultWorkspaceRoot: string,
  defaultPort = 3456,
  isExplicit = false
): RegisteredWorkspace[] {
  const resolvedRegistryPath = resolve(registryPath);
  if (existsSync(resolvedRegistryPath)) {
    try {
      if (statSync(resolvedRegistryPath).isDirectory()) {
        throw new Error(`Registry path is a directory, expected a JSON file: ${resolvedRegistryPath}`);
      }
    } catch (err: any) {
      if (err.message.includes("is a directory")) throw err;
    }
    let rawJson: any;
    try {
      const text = readFileSync(resolvedRegistryPath, "utf8");
      rawJson = JSON.parse(text);
    } catch (err: any) {
      throw new Error(`Invalid JSON syntax in registry file "${resolvedRegistryPath}": ${err?.message || err}`);
    }
    return validateWorkspaceRegistryData(rawJson, resolvedRegistryPath, defaultPort);
  }

  if (isExplicit) {
    throw new Error(`Registry file does not exist: "${resolvedRegistryPath}"`);
  }

  return [
    {
      id: "default",
      name: "Default Workspace",
      path: resolve(defaultWorkspaceRoot),
      port: defaultPort
    }
  ];
}


export function getWorkspacesSummaryList(registry: RegisteredWorkspace[]): WorkspaceSummary[] {
  return registry.map(w => {
    const canonicalPath = resolve(w.path);
    if (!existsSync(canonicalPath)) {
      return {
        id: w.id,
        name: w.name,
        path: canonicalPath,
        port: w.port,
        status: "UNAVAILABLE",
        error: "Workspace directory does not exist"
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
          error: "Workspace path is not a directory"
        };
      }
    } catch {
      return {
        id: w.id,
        name: w.name,
        path: canonicalPath,
        port: w.port,
        status: "UNAVAILABLE",
        error: "Cannot access workspace directory"
      };
    }

    let stage = "IDLE";
    let currentChangeId: string | null = null;
    let tasksCount = 0;
    let blockersCount = 0;
    const statePath = join(canonicalPath, ".continuity", "state.json");
    if (isPathContained(canonicalPath, statePath) && existsSync(statePath)) {
      try {
        const state = JSON.parse(readFileSync(statePath, "utf8"));
        stage = state.stage || "IDLE";
        currentChangeId = state.currentChangeId || null;
        tasksCount = Array.isArray(state.tasks) ? state.tasks.length : 0;
        blockersCount = Array.isArray(state.blockers) ? state.blockers.length : 0;
      } catch {}
    }

    const git = getGitSummary(canonicalPath);

    return {
      id: w.id,
      name: w.name,
      path: canonicalPath,
      port: w.port,
      status: "ACTIVE",
      stage,
      currentChangeId,
      tasksCount,
      blockersCount,
      gitClean: git.clean
    };
  });
}

export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Continuity Core Dashboard</title>
  <style>
    :root {
      --bg-dark: #090d16;
      --card-bg: rgba(22, 28, 45, 0.75);
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
      padding: 24px;
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
  </style>
</head>
<body>
  <div id="root">
    <div style="display: flex; justify-content: center; align-items: center; height: 80vh;">
      <div class="badge badge-blue" style="font-size: 1rem; padding: 12px 24px;">Loading Continuity Core Dashboard...</div>
    </div>
  </div>
  <script src="/bundle.js"></script>
</body>
</html>`;
}

function parsePortValue(val: string, flag: string): number {
  const trimmed = val.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    throw new Error(`Invalid port value for ${flag}: "${val}". Port must be a valid integer between 0 and 65535.`);
  }
  const num = Number(trimmed);
  if (!Number.isSafeInteger(num) || num < 0 || num > 65535) {
    throw new Error(`Invalid port number for ${flag}: ${num}. Port must be between 0 and 65535.`);
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
  const rawWorkspace = options.workspaceRoot ?? process.env.CONTINUITY_WORKSPACE_PATH ?? process.cwd();
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
    if (typeof options.port !== "number" || !Number.isSafeInteger(options.port) || options.port < 0 || options.port > 65535) {
      throw new Error(`Invalid port: ${options.port}. Port must be an integer between 0 and 65535.`);
    }
    port = options.port;
  } else if (process.env.PORT !== undefined) {
    port = parsePortValue(process.env.PORT, "PORT environment variable");
  } else {
    port = 3456;
  }
  const statePath = resolve(workspaceRoot, process.env.CONTINUITY_STATE_PATH ?? ".continuity/state.json");
  const isExplicitRegistry = Boolean(options.registryPath ?? process.env.CONTINUITY_REGISTRY_PATH);
  const rawRegistryPath = options.registryPath ?? process.env.CONTINUITY_REGISTRY_PATH ?? join(workspaceRoot, ".continuity", "workspaces.json");
  const registry = loadWorkspaceRegistry(rawRegistryPath, workspaceRoot, port, isExplicitRegistry);


  const getTargetWorkspace = (workspaceId?: string | null): { root: string; summary?: RegisteredWorkspace } => {
    if (!workspaceId) {
      return { root: workspaceRoot };
    }
    const match = registry.find(w => w.id === workspaceId);
    if (!match) {
      throw new Error("UNREGISTERED");
    }
    const canonicalRoot = resolve(match.path);
    if (!existsSync(canonicalRoot) || !statSync(canonicalRoot).isDirectory()) {
      throw new Error("UNAVAILABLE");
    }
    return { root: canonicalRoot, summary: match };
  };

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const parsedUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = parsedUrl.pathname;

    // Helper to send JSON without wildcard CORS
    const sendJson = (data: unknown, status = 200) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8"
      });
      res.end(JSON.stringify(data, null, 2));
    };

    // Helper to send text/html/js without wildcard CORS
    const sendContent = (content: string | Buffer, status = 200, contentType = "text/html; charset=utf-8") => {
      res.writeHead(status, {
        "Content-Type": contentType
      });
      res.end(content);
    };

    // Strictly read-only server: reject non-GET/HEAD requests
    if (req.method !== "GET" && req.method !== "HEAD") {
      return sendJson({ error: "Method not allowed: server is read-only" }, 405);
    }

    // 1. GET /api/health
    if (pathname === "/api/health") {
      return sendJson({ status: "ok", timestamp: new Date().toISOString() });
    }

    // 2. GET /api/workspaces (Registry list & status summary)
    if (pathname === "/api/workspaces") {
      const summaries = getWorkspacesSummaryList(registry);
      return sendJson({ workspaces: summaries });
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
              return sendJson({ error: "Access denied: Workspace is not in registered allowlist" }, 403);
            }
            return sendJson({ error: "Target workspace is unavailable or directory is missing" }, 404);
          }
        }
        const targetStatePath = wsParam
          ? resolve(targetRoot, ".continuity", "state.json")
          : statePath;
        if (!isPathContained(targetRoot, targetStatePath)) {
          return sendJson({ error: "Access denied: State path is outside workspace" }, 403);
        }
        if (existsSync(targetStatePath)) {
          const raw = JSON.parse(readFileSync(targetStatePath, "utf8"));
          return sendJson(raw);
        }
        return sendJson({ projectId: wsParam || "default", currentChangeId: null, stage: "IDLE", tasks: [], checkpoints: [], blockers: [], decisions: [] });
      } catch (err: any) {
        return sendJson({ error: err?.message || "Failed to read state" }, 500);
      }
    }

    // 4. GET /api/git
    if (pathname === "/api/git") {
      const wsParam = parsedUrl.searchParams.get("workspace");
      let targetRoot = workspaceRoot;
      if (wsParam) {
        try {
          const resolved = getTargetWorkspace(wsParam);
          targetRoot = resolved.root;
        } catch (e: any) {
          if (e.message === "UNREGISTERED") {
            return sendJson({ error: "Access denied: Workspace is not in registered allowlist" }, 403);
          }
          return sendJson({ error: "Target workspace is unavailable" }, 404);
        }
      }
      const summary = getGitSummary(targetRoot);
      return sendJson(summary);
    }

    // 5. GET /api/artifacts
    if (pathname === "/api/artifacts") {
      const wsParam = parsedUrl.searchParams.get("workspace");
      let targetRoot = workspaceRoot;
      if (wsParam) {
        try {
          const resolved = getTargetWorkspace(wsParam);
          targetRoot = resolved.root;
        } catch (e: any) {
          if (e.message === "UNREGISTERED") {
            return sendJson({ error: "Access denied: Workspace is not in registered allowlist" }, 403);
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
        return sendJson({ error: "Access denied: Path is outside workspace or not allowlisted" }, 403);
      }

      if (!existsSync(targetPath) || statSync(targetPath).isDirectory()) {
        return sendJson({ error: "Artifact not found" }, 404);
      }

      try {
        const content = readFileSync(targetPath, "utf8");
        return sendContent(content, 200, "text/plain; charset=utf-8");
      } catch (err: any) {
        return sendJson({ error: err?.message || "Failed to read artifact" }, 500);
      }
    }

    // 6. GET /bundle.js (Local offline React bundle from fixed installation path)
    if (pathname === "/bundle.js" || pathname === "/dist/public/bundle.js") {
      const moduleDir = dirname(fileURLToPath(import.meta.url));
      const candidates = [
        join(moduleDir, "public", "bundle.js"),
        resolve(moduleDir, "..", "dist", "public", "bundle.js")
      ];
      const bundlePath = candidates.find(p => existsSync(p));
      if (bundlePath) {
        try {
          const js = readFileSync(bundlePath, "utf8");
          return sendContent(js, 200, "application/javascript; charset=utf-8");
        } catch (err: any) {
          return sendJson({ error: "Failed to read bundle" }, 500);
        }
      }
      return sendJson({ error: "Bundle not found. Run npm run build first." }, 404);
    }

    // 7. GET / or UI route
    if (pathname === "/" || pathname === "/index.html") {
      const html = getDashboardHtml();
      return sendContent(html, 200, "text/html; charset=utf-8");
    }

    // Fallback 404
    return sendJson({ error: "Not found" }, 404);
  });

  return {
    server,
    port,
    workspaceRoot,
    registry,
    start: () =>
      new Promise<number>((resolvePromise, reject) => {
        // Bind strictly to 127.0.0.1
        server.listen(port, "127.0.0.1", () => {
          const address = server.address();
          const actualPort = typeof address === "object" && address ? address.port : port;
          resolvePromise(actualPort);
        });
        server.on("error", reject);
      }),
    stop: () =>
      new Promise<void>((resolvePromise, reject) => {
        server.close(err => (err ? reject(err) : resolvePromise()));
      })
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const cliOptions = parseDashboardCliArgs(process.argv.slice(2));
    const dashboard = createDashboardServer(cliOptions);
    dashboard.start().then(actualPort => {
      console.log(`[Continuity Dashboard] Running on http://127.0.0.1:${actualPort} (workspace: ${dashboard.workspaceRoot})`);
    }).catch((err: any) => {
      console.error(`[Continuity Dashboard Error] ${err?.message || String(err)}`);
      process.exit(1);
    });
  } catch (err: any) {
    console.error(`[Continuity Dashboard Error] ${err?.message || String(err)}`);
    process.exit(1);
  }
}

