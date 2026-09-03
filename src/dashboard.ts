import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";

export interface DashboardOptions {
  workspaceRoot?: string;
  port?: number;
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
    const branch = execSync("git branch --show-current", { cwd: workspaceRoot, encoding: "utf8" }).trim();
    const statusOut = execSync("git status --porcelain", { cwd: workspaceRoot, encoding: "utf8" }).trim();
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

export function createDashboardServer(options: DashboardOptions = {}) {
  const workspaceRoot = resolve(options.workspaceRoot ?? process.env.CONTINUITY_WORKSPACE_PATH ?? process.cwd());
  const statePath = resolve(workspaceRoot, process.env.CONTINUITY_STATE_PATH ?? ".continuity/state.json");
  const port = options.port ?? (process.env.PORT ? parseInt(process.env.PORT, 10) : 3456);

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

    // 1. GET /api/health
    if (pathname === "/api/health") {
      return sendJson({ status: "ok", timestamp: new Date().toISOString() });
    }

    // 2. GET /api/state
    if (pathname === "/api/state") {
      try {
        if (existsSync(statePath)) {
          const raw = JSON.parse(readFileSync(statePath, "utf8"));
          return sendJson(raw);
        }
        return sendJson({ projectId: "default", currentChangeId: null, stage: "IDLE", tasks: [], checkpoints: [], blockers: [], decisions: [] });
      } catch (err: any) {
        return sendJson({ error: err?.message || "Failed to read state" }, 500);
      }
    }

    // 3. GET /api/git
    if (pathname === "/api/git") {
      const summary = getGitSummary(workspaceRoot);
      return sendJson(summary);
    }

    // 4. GET /api/artifacts
    if (pathname === "/api/artifacts") {
      const requestedPath = parsedUrl.searchParams.get("path");
      if (!requestedPath) {
        // List allowlisted artifacts
        const artifacts = getAllowlistedArtifactsList(workspaceRoot);
        return sendJson({ artifacts });
      }

      // Security check: Segment-aware containment and allowlist
      const targetPath = join(workspaceRoot, requestedPath);
      if (!isAllowlistedArtifact(workspaceRoot, targetPath)) {
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

    // 5. GET /bundle.js (Local offline React bundle)
    if (pathname === "/bundle.js" || pathname === "/dist/public/bundle.js") {
      const candidates = [
        join(workspaceRoot, "dist", "public", "bundle.js"),
        join(dirname(fileURLToPath(import.meta.url)), "public", "bundle.js")
      ];
      const bundlePath = candidates.find(p => existsSync(p));
      if (bundlePath && isPathContained(workspaceRoot, bundlePath)) {
        try {
          const js = readFileSync(bundlePath, "utf8");
          return sendContent(js, 200, "application/javascript; charset=utf-8");
        } catch (err: any) {
          return sendJson({ error: "Failed to read bundle" }, 500);
        }
      }
      return sendJson({ error: "Bundle not found. Run npm run build first." }, 404);
    }

    // 6. GET / or UI route
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
  const dashboard = createDashboardServer();
  dashboard.start().then(port => {
    console.log(`[Continuity Dashboard] Running on http://127.0.0.1:${port}`);
  });
}
