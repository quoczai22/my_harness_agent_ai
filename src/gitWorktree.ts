/**
 * Git helpers for run isolation: every run works in its own worktree and
 * branch outside the imported repository, and only the Harness commits.
 */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export interface GitResult { code: number; stdout: string; stderr: string }

export function git(cwd: string, args: string[], timeoutMs = 60_000): GitResult {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 });
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    throw new Error(code === "ENOENT" ? "GIT_NOT_INSTALLED" : `GIT_FAILED: ${result.error.message}`);
  }
  return { code: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function gitOk(cwd: string, args: string[], timeoutMs?: number): string {
  const result = git(cwd, args, timeoutMs);
  if (result.code !== 0) throw new Error(`GIT_FAILED: git ${args[0]}: ${(result.stderr || result.stdout).trim().slice(0, 500)}`);
  return result.stdout;
}

/** Returns the repository top level, or throws NOT_A_GIT_REPOSITORY. */
export function repositoryRoot(path: string): string {
  const result = git(path, ["rev-parse", "--show-toplevel"]);
  if (result.code !== 0) throw new Error("NOT_A_GIT_REPOSITORY");
  return resolve(result.stdout.trim());
}

export function headCommit(repo: string): string {
  const result = git(repo, ["rev-parse", "--verify", "HEAD"]);
  if (result.code !== 0) throw new Error("REPOSITORY_HAS_NO_COMMITS");
  return result.stdout.trim();
}

export function hasUncommittedChanges(repo: string): boolean {
  return gitOk(repo, ["status", "--porcelain"]).trim().length > 0;
}

export function createRunWorktree(repo: string, worktreeDir: string, branch: string): { base: string } {
  if (!/^harness\/[A-Za-z0-9._-]{1,80}$/.test(branch)) throw new Error("INVALID_BRANCH");
  const base = headCommit(repo);
  if (existsSync(worktreeDir)) throw new Error("WORKTREE_EXISTS");
  gitOk(repo, ["worktree", "add", "-b", branch, worktreeDir, base], 180_000);
  return { base };
}

export function removeRunWorktree(repo: string, worktreeDir: string): void {
  if (!existsSync(worktreeDir)) return;
  const result = git(repo, ["worktree", "remove", "--force", worktreeDir], 120_000);
  if (result.code !== 0) rmSync(worktreeDir, { recursive: true, force: true });
  git(repo, ["worktree", "prune"]);
}

export interface ChangedFile { path: string; status: string }

/** Every changed, added, deleted or untracked file relative to the worktree's HEAD. */
export function changedFiles(worktree: string): ChangedFile[] {
  const out = gitOk(worktree, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const parts = out.split("\0").filter(Boolean);
  const files: ChangedFile[] = [];
  for (let i = 0; i < parts.length; i++) {
    const status = parts[i].slice(0, 2);
    const path = parts[i].slice(3);
    files.push({ path, status });
    if (status[0] === "R" || status[0] === "C") i++; // skip the rename source
  }
  return files;
}

function insideWorktree(worktree: string, path: string): string {
  const absolute = resolve(worktree, path);
  const rel = relative(resolve(worktree), absolute);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("UNSAFE_PATH");
  return absolute;
}

/** Puts the given paths back to HEAD; files absent from HEAD are deleted. */
export function revertFiles(worktree: string, paths: string[]): void {
  for (const path of paths) {
    const absolute = insideWorktree(worktree, path);
    const inHead = git(worktree, ["cat-file", "-e", `HEAD:${path}`]).code === 0;
    if (inHead) {
      gitOk(worktree, ["restore", "--source=HEAD", "--staged", "--worktree", "--", path]);
    } else {
      git(worktree, ["rm", "--cached", "--quiet", "--ignore-unmatch", "--", path]);
      rmSync(absolute, { force: true, recursive: true });
    }
  }
}

/** Unified diff of everything in the worktree against HEAD, including new files. */
export function worktreeDiff(worktree: string, maxBytes = 60_000): string {
  git(worktree, ["add", "-A", "--intent-to-add"]);
  const diff = gitOk(worktree, ["diff", "HEAD", "--no-color", "--no-ext-diff"]);
  return diff.length > maxBytes ? `${diff.slice(0, maxBytes)}\n[diff truncated at ${maxBytes} bytes]` : diff;
}

/** Commits everything in the worktree; returns the new sha, or null when nothing changed. */
export function commitAll(worktree: string, message: string): string | null {
  gitOk(worktree, ["add", "-A"]);
  if (git(worktree, ["diff", "--cached", "--quiet"]).code === 0) return null;
  const identity: string[] = [];
  if (git(worktree, ["config", "user.name"]).code !== 0) identity.push("-c", "user.name=Harness");
  if (git(worktree, ["config", "user.email"]).code !== 0) identity.push("-c", "user.email=harness@localhost");
  gitOk(worktree, [...identity, "commit", "--quiet", "--no-verify", "-m", message]);
  return gitOk(worktree, ["rev-parse", "HEAD"]).trim();
}

/** `**` crosses directories, `*` and `?` stay within one path segment. */
export function globToRegExp(pattern: string): RegExp {
  let p = pattern.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (p.endsWith("/")) p += "**";
  let source = "";
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === "*") {
      if (p[i + 1] === "*") {
        const slash = p[i + 2] === "/";
        source += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else source += "[^/]*";
    } else if (ch === "?") source += "[^/]";
    else source += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

export function matchesAny(path: string, patterns: string[]): boolean {
  const normalized = path.replace(/\\/g, "/");
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
}
