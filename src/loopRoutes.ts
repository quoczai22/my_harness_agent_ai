/**
 * HTTP API for the agent loop under /api/loop/. Every request must come from
 * the Harness page itself: loopback Host, same Origin, and JSON bodies (which
 * forces a CORS preflight that this server never answers), so another web
 * page cannot start agents or change the test command.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import { createHash } from "node:crypto";
import { chatCommand, extractTaskProposals, runClaudeChat, TASK_PROPOSAL_INSTRUCTIONS } from "./claudeChat.js";
import type { LoopEngine } from "./loopEngine.js";
import type { LoopEvent } from "./loopStore.js";
import { cloneRepository } from "./repoImport.js";
import { discoverProviderStates, loadHarnessSessions, updateHarnessSession } from "./universalHarness.js";
import { registerUserWorkspace } from "./workspaceRegistry.js";

export interface LoopRouteContext {
  engine: LoopEngine;
  localRegistryPath: string;
  getTargetWorkspace: (workspaceId?: string | null) => { root: string };
  readJson: (req: IncomingMessage, maximumBytes?: number) => Promise<any>;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function isTrustedLoopRequest(req: IncomingMessage): boolean {
  const host = req.headers.host ?? "";
  let hostname: string;
  try { hostname = new URL(`http://${host}`).hostname; } catch { return false; }
  if (!LOOPBACK_HOSTS.has(hostname)) return false;
  const origin = req.headers.origin;
  if (origin && origin !== `http://${host}`) return false;
  // Browsers send Origin on every POST; a POST without it did not come from the page.
  if (req.method === "POST" && !origin) return false;
  if (req.method === "POST" && !(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) return false;
  return true;
}

const ERRORS: Record<string, [number, string]> = {
  UNREGISTERED: [403, "Workspace is not registered"],
  UNAVAILABLE: [404, "Workspace is unavailable"],
  INVALID_JSON: [400, "Invalid JSON body"],
  REQUEST_TOO_LARGE: [413, "Request body is too large"],
  NO_QUEUED_TASKS: [409, "There are no queued tasks. Add or approve a task first."],
  NOT_A_GIT_REPOSITORY: [400, "This workspace is not a Git repository. Run git init and make a first commit."],
  REPOSITORY_HAS_NO_COMMITS: [400, "This repository has no commits yet. Make a first commit, then start a run."],
  RUN_NOT_FOUND: [404, "Run not found"],
  RUN_NOT_ACTIVE: [409, "That run is not active"],
  RUN_NOT_WAITING: [409, "That run is not waiting for your answer"],
  RUN_NOT_RESUMABLE: [409, "That run cannot be resumed"],
  ANOTHER_RUN_ACTIVE: [409, "Another run is active in this workspace"],
  WORKTREE_MISSING: [409, "The run's worktree no longer exists, so it cannot resume"],
  TASK_TITLE_REQUIRED: [400, "Every task needs a title"],
  INVALID_CLONE_URL: [400, "Enter an https:// Git URL"],
  CLONE_URL_MUST_BE_HTTPS: [400, "Only https:// Git URLs can be cloned"],
  CLONE_URL_HAS_CREDENTIALS: [400, "Remove the user name or token from the URL; Git uses your own credential setup"],
  CLONE_TARGET_EXISTS: [409, "A folder with that name already exists in the projects directory"],
  SESSION_NOT_FOUND: [404, "Session was not found in this workspace"],
  GIT_NOT_INSTALLED: [500, "Git is not installed"],
  STATE_DIR_INSIDE_REPOSITORY: [400, "The Harness state directory is inside this repository. Point HARNESS_STATE_DIR somewhere outside it."],
};

function errorResponse(err: any): [number, string] {
  const message = String(err?.message ?? err);
  const code = message.split(":")[0];
  if (ERRORS[code]) return ERRORS[code];
  if (code === "INVALID_PIPELINE") return [400, message.slice("INVALID_PIPELINE: ".length)];
  if (code === "CLONE_FAILED") return [502, `git clone failed: ${message.slice("CLONE_FAILED: ".length)}`];
  return [500, message];
}

async function agentAvailability(engine: LoopEngine) {
  const providers = await discoverProviderStates();
  const config = engine.agentConfig();
  const claudeCmd = config.agents.claude?.cmd?.[0] ?? "claude";
  const which = (command: string) => isAbsolute(command)
    ? existsSync(command)
    : (process.env.PATH ?? "").split(delimiter).some((dir) => dir && existsSync(join(dir, command)));
  const claudeInstalled = which(claudeCmd) || existsSync(join(homedir(), ".local", "bin", claudeCmd));
  let lmstudio: { status: string; detail: string };
  try {
    const base = (config.endpoints?.lmstudio ?? "http://127.0.0.1:1234").replace(/\/+$/, "");
    const response = await fetch(`${base}/v1/models`, { signal: AbortSignal.timeout(1_500), redirect: "error" });
    const body = response.ok ? await response.json() as any : null;
    const models = Array.isArray(body?.data) ? body.data.length : 0;
    lmstudio = response.ok
      ? { status: "available", detail: `${models} model(s) on the local server${config.models?.lmstudio ? `; using ${config.models.lmstudio}` : "; set models.lmstudio to use it"}` }
      : { status: "offline", detail: `LM Studio answered HTTP ${response.status}` };
  } catch {
    lmstudio = { status: "offline", detail: "Start the LM Studio server (port 1234) to use it" };
  }
  return [
    { id: "claude", name: "Claude Code", status: claudeInstalled ? "available" : "not installed", detail: claudeInstalled ? "Uses your own Claude Code login" : "Install Claude Code and sign in" },
    ...providers.map((p) => ({ id: p.id, name: p.name, status: p.status, detail: p.detail })),
    { id: "lmstudio", name: "LM Studio", ...lmstudio },
  ];
}

export async function handleLoopRequest(req: IncomingMessage, res: ServerResponse, url: URL, ctx: LoopRouteContext): Promise<boolean> {
  if (!url.pathname.startsWith("/api/loop/")) return false;
  const sendJson = (data: unknown, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(data));
  };
  if (!isTrustedLoopRequest(req)) {
    sendJson({ error: "Requests to the agent loop must come from the Harness page" }, 403);
    return true;
  }
  const route = url.pathname.slice("/api/loop/".length);
  const workspaceParam = url.searchParams.get("workspace");
  const sessionWorkspaceId = workspaceParam || "default";
  const { engine } = ctx;

  try {
    if (route === "agents" && req.method === "GET") {
      sendJson({ agents: await agentAvailability(engine) });
      return true;
    }

    if (route === "import" && req.method === "POST") {
      const body = await ctx.readJson(req, 8_000);
      const target = await cloneRepository(String(body.url ?? ""));
      const registered = registerUserWorkspace(ctx.localRegistryPath, target);
      sendJson({ ...registered, path: target }, 201);
      return true;
    }

    const target = ctx.getTargetWorkspace(workspaceParam);
    // Loop state belongs to a repository, not just to a registry id that could later point elsewhere.
    const workspaceId = `${workspaceParam || "default"}-${createHash("sha256").update(target.root).digest("hex").slice(0, 10)}`;

    if (route === "state" && req.method === "GET") {
      const state = engine.store(workspaceId).read();
      const active = engine.activeRun(workspaceId);
      sendJson({
        tasks: state.tasks,
        runs: state.runs.slice(-20).reverse(),
        activeRunId: active?.id ?? null,
        pipeline: engine.pipeline(workspaceId),
        commands: engine.commands(workspaceId, target.root),
      });
      return true;
    }

    if (req.method !== "POST" && route !== "events") {
      sendJson({ error: "Method not allowed" }, 405);
      return true;
    }

    switch (route) {
      case "tasks": {
        const body = await ctx.readJson(req);
        sendJson({ tasks: engine.addTasks(workspaceId, Array.isArray(body.tasks) ? body.tasks : [], "user") }, 201);
        return true;
      }
      case "tasks/status": {
        const body = await ctx.readJson(req, 16_000);
        const status = body.status === "canceled" ? "canceled" : "queued";
        const ids = Array.isArray(body.ids) ? body.ids.filter((id: unknown) => typeof id === "string") : [];
        sendJson({ tasks: engine.setTaskStatus(workspaceId, ids, status) });
        return true;
      }
      case "pipeline": {
        const body = await ctx.readJson(req, 64_000);
        sendJson({ pipeline: engine.setPipeline(workspaceId, body.pipeline) });
        return true;
      }
      case "commands": {
        const body = await ctx.readJson(req, 8_000);
        engine.setCommands(workspaceId, { build: body.build, test: body.test });
        sendJson({ commands: engine.commands(workspaceId, target.root) });
        return true;
      }
      case "runs": {
        sendJson({ run: engine.startRun(workspaceId, target.root) }, 201);
        return true;
      }
      case "runs/action": {
        const body = await ctx.readJson(req, 8_000);
        const runId = String(body.runId ?? "");
        switch (body.action) {
          case "pause": engine.pause(workspaceId, runId); break;
          case "resume": engine.resume(workspaceId, runId); break;
          case "cancel": engine.cancel(workspaceId, runId); break;
          case "approve": engine.answerHuman(workspaceId, runId, true); break;
          case "reject": engine.answerHuman(workspaceId, runId, false); break;
          default: sendJson({ error: "Unknown action" }, 400); return true;
        }
        sendJson({ run: engine.getRun(workspaceId, runId) });
        return true;
      }
      case "events": {
        if (req.method !== "GET") { sendJson({ error: "Use GET" }, 405); return true; }
        const runId = url.searchParams.get("run") ?? "";
        engine.getRun(workspaceId, runId);
        const lastEventId = Number(req.headers["last-event-id"] ?? url.searchParams.get("after") ?? 0) || 0;
        res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive" });
        const send = (event: LoopEvent) => res.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
        for (const event of engine.store(workspaceId).readEvents(runId, lastEventId)) send(event);
        const listener = (ws: string, event: LoopEvent) => { if (ws === workspaceId && event.runId === runId) send(event); };
        engine.on("event", listener);
        const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 15_000);
        req.on("close", () => { clearInterval(keepAlive); engine.off("event", listener); });
        return true;
      }
      case "chat": {
        const body = await ctx.readJson(req, 64_000);
        const sessionId = String(body.sessionId ?? "");
        const propose = body.propose === true;
        const message = propose ? TASK_PROPOSAL_INSTRUCTIONS : String(body.message ?? "").trim().slice(0, 20_000);
        if (!message) { sendJson({ error: "Write a message first" }, 400); return true; }
        const session = loadHarnessSessions(target.root, sessionWorkspaceId).find((s) => s.id === sessionId);
        if (!session) { sendJson({ error: "Session was not found in this workspace" }, 404); return true; }
        const config = engine.agentConfig();
        chatCommand(config, message, session.claudeSessionId);
        const createdAt = new Date().toISOString();
        updateHarnessSession(target.root, sessionWorkspaceId, sessionId, (current) => ({
          ...current,
          messages: [...(current.messages ?? []), { id: `user-${Date.now()}`, role: "user", content: propose ? "Chia thành task" : message, createdAt }],
        }));
        res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" });
        const controller = new AbortController();
        res.on("close", () => { if (!res.writableFinished) controller.abort(); });
        const result = await runClaudeChat(config, { cwd: target.root, message, resumeId: session.claudeSessionId, signal: controller.signal }, (event) => {
          if (!res.writableEnded) res.write(`${JSON.stringify(event)}\n`);
        });
        const proposals = propose && !result.error ? engine.addTasks(workspaceId, extractTaskProposals(result.text), "claude") : [];
        updateHarnessSession(target.root, sessionWorkspaceId, sessionId, (current) => ({
          ...current,
          claudeSessionId: result.sessionId ?? current.claudeSessionId,
          messages: [...(current.messages ?? []), {
            id: `assistant-${Date.now()}`, role: "assistant", provider: "claude", content: result.text || result.error || "", createdAt: new Date().toISOString(),
            ...(result.error ? { error: result.error } : {}),
          }],
        }));
        if (!res.writableEnded) res.end(`${JSON.stringify({ type: "done", proposals: proposals.length })}\n`);
        return true;
      }
      default:
        sendJson({ error: "Not found" }, 404);
        return true;
    }
  } catch (err) {
    const [status, message] = errorResponse(err);
    if (!res.headersSent) sendJson({ error: message }, status);
    else res.end();
    return true;
  }
}
