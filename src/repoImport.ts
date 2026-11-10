/**
 * Imports a repository by cloning an https:// Git URL into the projects
 * directory. No credentials are stored or accepted in the URL; private
 * repositories rely on the user's own Git credential setup.
 */
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { runProcess } from "./agentRunner.js";

export function projectsDirectory(): string {
  return resolve(process.env.HARNESS_PROJECTS_DIR || join(homedir(), "projects"));
}

/** Validates the URL and returns the folder name it will be cloned into. */
export function cloneTargetName(url: string): string {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("INVALID_CLONE_URL"); }
  if (parsed.protocol !== "https:") throw new Error("CLONE_URL_MUST_BE_HTTPS");
  if (parsed.username || parsed.password) throw new Error("CLONE_URL_HAS_CREDENTIALS");
  if (parsed.search || parsed.hash) throw new Error("INVALID_CLONE_URL");
  const last = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
  const name = last.replace(/\.git$/i, "").replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[.-]+/, "");
  if (!name) throw new Error("INVALID_CLONE_URL");
  return name.slice(0, 80);
}

export async function cloneRepository(url: string, projectsDir = projectsDirectory()): Promise<string> {
  const name = cloneTargetName(url);
  mkdirSync(projectsDir, { recursive: true });
  const target = join(projectsDir, name);
  if (existsSync(target)) throw new Error("CLONE_TARGET_EXISTS");
  const result = await runProcess(["git", "clone", "--", url, target], {
    cwd: projectsDir,
    timeoutMs: 10 * 60_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (result.exitCode !== 0) {
    throw new Error(`CLONE_FAILED: ${(result.error || result.output).trim().slice(-500)}`);
  }
  return target;
}
