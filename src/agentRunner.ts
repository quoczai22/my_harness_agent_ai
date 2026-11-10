/**
 * Runs agent CLIs and repository commands for the loop engine, the way
 * ~/agent-kit/bin/agent-run does: fixed argument arrays from a config file,
 * no shell, a timeout, cancellation, and a bounded output tail.
 */
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { AgentId, AgentRole } from "./pipeline.js";

export interface AgentCommandConfig {
  cmd: string[];
  review_cmd?: string[];
}

export interface AgentConfig {
  agents: Partial<Record<AgentId, AgentCommandConfig>>;
  timeouts: { workerMinutes: number; reviewMinutes: number; buildMinutes: number };
  /** Loopback endpoints for agents reached over HTTP. */
  endpoints?: { lmstudio?: string; ollama?: string };
  /** Model names for agents reached over HTTP. */
  models?: { lmstudio?: string; ollama?: string };
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  agents: {
    claude: {
      cmd: ["claude", "-p", "{prompt}", "--permission-mode", "acceptEdits"],
      review_cmd: ["claude", "-p", "{prompt}", "--permission-mode", "plan"],
    },
    codex: {
      cmd: ["codex", "exec", "--sandbox", "workspace-write", "{prompt}"],
      review_cmd: ["codex", "exec", "--sandbox", "read-only", "{prompt}"],
    },
    antigravity: { cmd: ["agy", "--print", "{prompt}"] },
  },
  timeouts: { workerMinutes: 40, reviewMinutes: 20, buildMinutes: 20 },
  endpoints: { lmstudio: "http://127.0.0.1:1234", ollama: "http://127.0.0.1:11434" },
  models: {},
};

/** Roles that only read the worktree use review_cmd when an agent has one. */
export function isReadingRole(role: AgentRole): boolean {
  return role !== "implement";
}

function normalizeConfig(raw: any): AgentConfig {
  const config: AgentConfig = JSON.parse(JSON.stringify(DEFAULT_AGENT_CONFIG));
  if (raw && typeof raw === "object") {
    if (raw.agents && typeof raw.agents === "object") {
      for (const [id, value] of Object.entries(raw.agents as Record<string, any>)) {
        if (!value || !Array.isArray(value.cmd) || !value.cmd.every((part: unknown) => typeof part === "string")) continue;
        const entry: AgentCommandConfig = { cmd: value.cmd };
        if (Array.isArray(value.review_cmd) && value.review_cmd.every((part: unknown) => typeof part === "string")) entry.review_cmd = value.review_cmd;
        (config.agents as Record<string, AgentCommandConfig>)[id] = entry;
      }
    }
    if (raw.timeouts && typeof raw.timeouts === "object") {
      for (const key of ["workerMinutes", "reviewMinutes", "buildMinutes"] as const) {
        const value = raw.timeouts[key];
        if (typeof value === "number" && value > 0 && value <= 240) config.timeouts[key] = value;
      }
    }
    if (raw.endpoints && typeof raw.endpoints === "object") config.endpoints = { ...config.endpoints, ...raw.endpoints };
    if (raw.models && typeof raw.models === "object") config.models = { ...config.models, ...raw.models };
  }
  return config;
}

/**
 * Loads the Harness agent config. On first use it starts from the user's
 * agent-run config (same shape) when one exists, otherwise from defaults.
 */
export function loadAgentConfig(path: string, agentKitConfig = join(homedir(), "agent-kit", "config.json")): AgentConfig {
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(agentKitConfig)) copyFileSync(agentKitConfig, path);
    else writeFileSync(path, JSON.stringify(DEFAULT_AGENT_CONFIG, null, 2), "utf8");
  }
  try {
    return normalizeConfig(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    throw new Error(`INVALID_AGENT_CONFIG: ${path} is not valid JSON`);
  }
}

/** Linux limits one argument to 128 KiB; stay well under it. */
export const MAX_PROMPT_BYTES = 100_000;

export function commandFor(config: AgentConfig, agent: AgentId, role: AgentRole, prompt: string): string[] {
  const entry = config.agents[agent];
  if (!entry) throw new Error(`AGENT_NOT_CONFIGURED: ${agent}`);
  const template = isReadingRole(role) && entry.review_cmd ? entry.review_cmd : entry.cmd;
  if (!template.includes("{prompt}")) throw new Error(`AGENT_CONFIG_NO_PROMPT: ${agent}`);
  if (Buffer.byteLength(prompt, "utf8") > MAX_PROMPT_BYTES) throw new Error("PROMPT_TOO_LARGE");
  return template.map((part) => (part === "{prompt}" ? prompt : part));
}

export interface ProcessResult {
  exitCode: number | null;
  output: string;
  timedOut: boolean;
  canceled: boolean;
  error?: string;
}

const OUTPUT_TAIL = 200_000;

export function runProcess(
  argv: string[],
  options: { cwd: string; timeoutMs: number; signal?: AbortSignal; onOutput?: (chunk: string) => void; env?: NodeJS.ProcessEnv },
): Promise<ProcessResult> {
  return new Promise((resolvePromise) => {
    if (options.signal?.aborted) return resolvePromise({ exitCode: null, output: "", timedOut: false, canceled: true });
    let output = "";
    let timedOut = false;
    let canceled = false;
    let settled = false;
    const child = spawn(argv[0], argv.slice(1), {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    const kill = () => {
      if (child.pid === undefined || child.exitCode !== null) return;
      try {
        if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
        else child.kill("SIGTERM");
      } catch { /* already gone */ }
      setTimeout(() => {
        try { if (child.exitCode === null && child.pid !== undefined) process.kill(process.platform !== "win32" ? -child.pid : child.pid, "SIGKILL"); } catch { /* gone */ }
      }, 3_000).unref();
    };
    const timer = setTimeout(() => { timedOut = true; kill(); }, options.timeoutMs);
    const onAbort = () => { canceled = true; kill(); };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const collect = (data: Buffer) => {
      const text = data.toString("utf8");
      output = (output + text).slice(-OUTPUT_TAIL);
      options.onOutput?.(text);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const finish = (exitCode: number | null, error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      resolvePromise({ exitCode, output, timedOut, canceled, ...(error ? { error } : {}) });
    };
    child.on("error", (err: NodeJS.ErrnoException) => finish(null, err.code === "ENOENT" ? `Command not found: ${argv[0]}` : err.message));
    child.on("close", (code) => finish(code));
  });
}

export interface Verdict {
  verdict: "PASS" | "FAIL" | null;
  issues: string;
}

/**
 * A verdict line holds nothing but the verdict, so an echoed instruction such
 * as "VERDICT: PASS or VERDICT: FAIL" (some CLIs print the prompt) never counts.
 */
const VERDICT_RE = /^[ \t>]*\**VERDICT\**[ \t]*:[ \t]*\**[ \t]*(PASS|FAIL)[ \t]*\**[ \t]*\.?[ \t]*$/gim;

/** Reads the last stand-alone `VERDICT: PASS|FAIL` line and the `ISSUES:` that follow it. */
export function parseVerdict(output: string): Verdict {
  const matches = [...output.matchAll(VERDICT_RE)];
  if (!matches.length) return { verdict: null, issues: "" };
  const last = matches[matches.length - 1];
  const after = output.slice((last.index ?? 0) + last[0].length);
  const issuesMatch = /ISSUES\s*:([\s\S]*)$/i.exec(after);
  return {
    verdict: last[1].toUpperCase() as "PASS" | "FAIL",
    issues: issuesMatch ? issuesMatch[1].trim().slice(0, 8_000) : "",
  };
}

/** Asks a loopback LM Studio or Ollama server (OpenAI-compatible API) for a reply. */
export async function queryLocalModel(
  config: AgentConfig,
  agent: "lmstudio" | "ollama",
  prompt: string,
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<ProcessResult> {
  const base = (config.endpoints?.[agent] ?? "").replace(/\/+$/, "");
  let url: URL;
  try { url = new URL(`${base}/v1/chat/completions`); } catch { return { exitCode: 1, output: "", timedOut: false, canceled: false, error: `Invalid ${agent} endpoint` }; }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    return { exitCode: 1, output: "", timedOut: false, canceled: false, error: `${agent} endpoint must be a loopback http URL` };
  }
  const model = config.models?.[agent];
  if (!model) return { exitCode: 1, output: "", timedOut: false, canceled: false, error: `Set models.${agent} in the agent config` };
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], stream: false }),
      signal,
      redirect: "error",
    });
    const body = await response.json() as any;
    const text = String(body?.choices?.[0]?.message?.content ?? "");
    if (!response.ok) return { exitCode: 1, output: text, timedOut: false, canceled: false, error: `${agent} returned HTTP ${response.status}` };
    return { exitCode: 0, output: text, timedOut: false, canceled: false };
  } catch (err: any) {
    const canceled = Boolean(options.signal?.aborted);
    const timedOut = !canceled && timeout.aborted;
    return { exitCode: null, output: "", timedOut, canceled, error: canceled ? undefined : timedOut ? undefined : `${agent} is not reachable: ${err?.message ?? err}` };
  }
}
