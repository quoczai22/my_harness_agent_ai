import { createHash } from "node:crypto";
import { execFile, type ChildProcess } from "node:child_process";
import { copyFile, lstat, mkdir, mkdtemp, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { isIgnoredRelativePath } from "./guards";
import { splitAssistantResponse } from "../chatResponse";
import type { StructuredProposal } from "../proposal";

export const COPY_MAX_FILES = 2_000;
export const COPY_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const COPY_MAX_BYTES = 50 * 1024 * 1024;
export const CHECK_OUTPUT_BYTES = 64 * 1024;
export const MODEL_DIAGNOSTIC_CHARS = 4_000;
const INTERNAL_BUFFER_BYTES = 16 * 1024 * 1024;
const excluded = new Set([".git", "node_modules", "build", "dist", "bin", "obj", ".continuity", ".aws", ".ssh"]);
const rootOnlyExcluded = new Set(["sessions", ".vscode"]);
const WINDOWS_COMMAND_GUIDANCE = "Trên Windows không chạy được .cmd/.bat khi không có shell; hãy dùng file .exe (ví dụ dart.exe analyze, dotnet build, node path/to/tsc.js)";

export function classifyCommandError(error: Error, platform: NodeJS.Platform): { kind: CheckFailureKind; message: string } {
  const code = (error as NodeJS.ErrnoException).code;
  const spawnFailure = code === "ENOENT" || code === "EINVAL";
  return {
    kind: spawnFailure || code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" ? "execution" : "checker",
    message: `${spawnFailure && platform === "win32" ? `${WINDOWS_COMMAND_GUIDANCE}\n` : ""}${error.message}`
  };
}

export type CheckStatus = "passed" | "failed" | "not-configured" | "blocked-untrusted" | "blocked-unapproved" | "cancelled";
export type CheckFailureKind = "checker" | "execution";
export interface ProposalCheckResult { proposal: StructuredProposal; status: CheckStatus; diagnostics: string; rounds: number; kind?: CheckFailureKind; }
export interface CheckOptions {
  workspaceRoot: string;
  relativePath: string;
  sourceText: string;
  proposal: StructuredProposal;
  command: string;
  timeoutSeconds: number;
  trusted: boolean;
  approved: boolean;
  signal?: AbortSignal;
  repair: (prompt: string) => Promise<string>;
  tempParent?: string;
  onTempCreated?: (path: string) => void;
  killTree?: (child: ChildProcess) => Promise<void>;
  platform?: NodeJS.Platform;
}

export function commandHash(command: string): string { return createHash("sha256").update(command, "utf8").digest("hex"); }

export function parseCheckCommand(command: string, files: string[]): { program: string; args: string[] } {
  if (!command.trim()) throw new Error("Check command is empty.");
  if (/[|;&><\r\n`]/.test(command)) throw new Error("Shell operators and redirection are not allowed in check commands.");
  const tokens: string[] = [];
  let token = "", quote = "", started = false;
  for (const char of command) {
    if (quote) {
      if (char === quote) quote = "";
      else token += char;
    } else if (char === '"' || char === "'") { quote = char; started = true; }
    else if (/\s/.test(char)) { if (started) { tokens.push(token); token = ""; started = false; } }
    else { token += char; started = true; }
  }
  if (quote) throw new Error("Unclosed quote in check command.");
  if (started) tokens.push(token);
  if (!tokens[0] || tokens[0] === "{files}") throw new Error("Check command needs an executable.");
  const args = tokens.slice(1).flatMap(part => part === "{files}" ? files : [part]);
  if (tokens.some(part => part !== "{files}" && part.includes("{files}"))) throw new Error("{files} must be a separate argument.");
  return { program: tokens[0], args };
}

function validateProposal(proposal: StructuredProposal, path: string, source: string): void {
  const normalized = proposal.path.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized !== path || path.startsWith("/") || path.split("/").includes("..") || /^[a-z]:/i.test(path)) throw new Error("Proposal target does not match the active workspace file.");
  const index = source.indexOf(proposal.original);
  if (index < 0 || source.indexOf(proposal.original, index + proposal.original.length) >= 0) throw new Error("Proposal original text must match the active document exactly once.");
}

function limitedOutput(text: string): string {
  const bytes = Buffer.from(text, "utf8");
  return bytes.length <= CHECK_OUTPUT_BYTES ? text : `${bytes.subarray(0, CHECK_OUTPUT_BYTES).toString("utf8")}\n[Output truncated at 64 KiB]`;
}

async function copyProject(root: string, destination: string, signal?: AbortSignal): Promise<void> {
  const realRoot = await realpath(root);
  const budget = { files: 0, bytes: 0 };
  const visit = async (sourceDir: string, targetDir: string): Promise<void> => {
    for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
      if (signal?.aborted) throw new Error("cancelled");
      if (excluded.has(entry.name.toLowerCase()) || (sourceDir === realRoot && rootOnlyExcluded.has(entry.name.toLowerCase()))) continue;
      const source = join(sourceDir, entry.name);
      const rel = relative(realRoot, source).replace(/\\/g, "/");
      if (isIgnoredRelativePath(rel)) continue;
      const info = await lstat(source);
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) {
        await mkdir(join(targetDir, entry.name), { recursive: true });
        await visit(source, join(targetDir, entry.name));
      } else if (info.isFile()) {
        if (info.size > COPY_MAX_FILE_BYTES) throw new Error(`Temporary copy limit: ${rel} exceeds 2 MiB per file.`);
        budget.files++;
        budget.bytes += info.size;
        if (budget.files > COPY_MAX_FILES) throw new Error("Temporary copy limit: more than 2,000 files.");
        if (budget.bytes > COPY_MAX_BYTES) throw new Error("Temporary copy limit: more than 50 MiB total.");
        const resolved = await realpath(source);
        if (!resolved.startsWith(realRoot + sep)) throw new Error("Temporary copy encountered a file outside the workspace.");
        await copyFile(source, join(targetDir, entry.name));
      }
    }
  };
  await visit(realRoot, destination);
}

async function defaultKillTree(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolveDone, reject) => execFile("taskkill", ["/T", "/F", "/PID", String(child.pid)], { shell: false, windowsHide: true, timeout: 10_000 }, error => error ? reject(error) : resolveDone()));
  } else child.kill("SIGKILL");
}

interface CommandOutcome { status: "passed" | "failed" | "cancelled"; diagnostics: string; kind?: CheckFailureKind; }

async function runCommand(command: string, files: string[], cwd: string, timeoutSeconds: number, signal?: AbortSignal, killTree = defaultKillTree, platform = process.platform): Promise<CommandOutcome> {
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 300) throw new Error("checkTimeoutSeconds must be between 1 and 300.");
  const { program, args } = parseCheckCommand(command, files);
  if (platform === "win32" && /\.(cmd|bat)$/i.test(program)) return { status: "failed", kind: "execution", diagnostics: WINDOWS_COMMAND_GUIDANCE };
  if (signal?.aborted) return { status: "cancelled", diagnostics: "Cancelled before check started." };
  return new Promise(resolveDone => {
    let reason: "timeout" | "cancelled" | undefined;
    let killError: string | undefined;
    let stopping: Promise<void> | undefined;
    let child: ChildProcess;
    try { child = execFile(program, args, { cwd, shell: false, windowsHide: true, maxBuffer: INTERNAL_BUFFER_BYTES }, (error, stdout, stderr) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      void (async () => {
        await stopping;
        const output = limitedOutput(`${stdout ?? ""}${stderr ?? ""}`);
        if (killError) resolveDone({ status: "failed", kind: "execution", diagnostics: `Could not stop check process tree: ${killError}\n${output}` });
        else if (reason === "cancelled") resolveDone({ status: "cancelled", diagnostics: "Check cancelled." });
        else if (reason === "timeout") resolveDone({ status: "failed", kind: "execution", diagnostics: `Check timed out after ${timeoutSeconds} seconds.\n${output}` });
        else if (error) {
          const classified = classifyCommandError(error, platform);
          resolveDone({ status: "failed", kind: classified.kind, diagnostics: limitedOutput(`${classified.message}\n${output}`) });
        } else resolveDone({ status: "passed", diagnostics: output });
      })();
    }); }
    catch (error) {
      const classified = classifyCommandError(error instanceof Error ? error : new Error(String(error)), platform);
      resolveDone({ status: "failed", kind: classified.kind, diagnostics: classified.message });
      return;
    }
    const stop = (why: "timeout" | "cancelled") => {
      if (reason || child.exitCode !== null) return;
      reason = why;
      stopping = killTree(child).catch(error => { killError = error instanceof Error ? error.message : String(error); child.kill("SIGKILL"); });
    };
    const onAbort = () => stop("cancelled");
    const timer = setTimeout(() => stop("timeout"), timeoutSeconds * 1_000);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

async function checkOnce(options: CheckOptions, proposal: StructuredProposal): Promise<CommandOutcome> {
  let temp = "";
  let outcome: CommandOutcome = { status: "failed", kind: "execution", diagnostics: "Check did not run." };
  try {
    temp = await mkdtemp(join(options.tempParent ?? tmpdir(), "continuity-check-"));
    options.onTempCreated?.(temp);
    await copyProject(options.workspaceRoot, temp, options.signal);
    if (options.signal?.aborted) outcome = { status: "cancelled", diagnostics: "Check cancelled." };
    else {
      const target = resolve(temp, options.relativePath);
      if (!target.startsWith(temp + sep)) throw new Error("Unsafe temporary target.");
      await mkdir(resolve(target, ".."), { recursive: true });
      const index = options.sourceText.indexOf(proposal.original);
      await writeFile(target, options.sourceText.slice(0, index) + proposal.replacement + options.sourceText.slice(index + proposal.original.length), "utf8");
      outcome = await runCommand(options.command, [options.relativePath], temp, options.timeoutSeconds, options.signal, options.killTree, options.platform);
    }
  } catch (error) {
    outcome = options.signal?.aborted ? { status: "cancelled", diagnostics: "Check cancelled." } : { status: "failed", kind: "execution", diagnostics: `Check preparation failed: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    if (temp) {
      try { await rm(temp, { recursive: true, force: true }); }
      catch (error) { outcome = { status: "failed", kind: "execution", diagnostics: `Could not remove temporary check directory ${temp}: ${error instanceof Error ? error.message : String(error)}` }; }
    }
  }
  return outcome;
}

export async function checkProposalLoop(options: CheckOptions): Promise<ProposalCheckResult> {
  let proposal = options.proposal;
  if (!options.command.trim()) return { proposal, status: "not-configured", diagnostics: "Check command not configured.", rounds: 0 };
  if (!options.trusted) return { proposal, status: "blocked-untrusted", diagnostics: "Check blocked: workspace is not trusted.", rounds: 0 };
  if (!options.approved) return { proposal, status: "blocked-unapproved", diagnostics: "Check blocked: command was not approved.", rounds: 0 };
  try { validateProposal(proposal, options.relativePath, options.sourceText); }
  catch (error) { return { proposal, status: "failed", kind: "execution", diagnostics: error instanceof Error ? error.message : String(error), rounds: 0 }; }
  for (let round = 0; round <= 2; round++) {
    if (options.signal?.aborted) return { proposal, status: "cancelled", diagnostics: "Check cancelled.", rounds: round };
    const result = await checkOnce(options, proposal);
    if (options.signal?.aborted || result.status === "cancelled") return { proposal, status: "cancelled", diagnostics: result.diagnostics, rounds: round };
    if (result.status === "passed") return { proposal, status: "passed", diagnostics: result.diagnostics, rounds: round };
    if (round === 2 || result.kind === "execution")
      return { proposal, status: "failed", kind: result.kind, diagnostics: result.diagnostics, rounds: round };
    const prompt = `Repair this proposed edit using only the check errors below. Return one JSON code block with path, original, replacement for the same file. The original must match the unchanged source exactly once. Do not invent unrelated files.\nTarget: ${options.relativePath}\nCurrent proposal: ${JSON.stringify(proposal)}\nCheck errors:\n${result.diagnostics.slice(0, MODEL_DIAGNOSTIC_CHARS)}`;
    let response: string;
    try { response = await options.repair(prompt); }
    catch (error) { return { proposal, status: "failed", diagnostics: `Repair request failed: ${error instanceof Error ? error.message : String(error)}\n${result.diagnostics}`, rounds: round }; }
    if (options.signal?.aborted) return { proposal, status: "cancelled", diagnostics: "Check cancelled.", rounds: round };
    const revised = splitAssistantResponse(response, options.relativePath).proposal;
    if (!revised) return { proposal, status: "failed", diagnostics: `Model returned no valid same-file repair.\n${result.diagnostics}`, rounds: round + 1 };
    try { validateProposal(revised, options.relativePath, options.sourceText); }
    catch (error) { return { proposal, status: "failed", diagnostics: `Invalid repair: ${error instanceof Error ? error.message : String(error)}\n${result.diagnostics}`, rounds: round + 1 }; }
    proposal = revised;
  }
  return { proposal, status: "failed", diagnostics: "Check exhausted repair rounds.", rounds: 2 };
}
