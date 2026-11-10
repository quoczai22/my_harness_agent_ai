/** Helpers shared by tests (not a test file itself). */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git } from "./gitWorktree.js";

export function makeTempRepo(): { dir: string; repo: string } {
  const dir = mkdtempSync(join(tmpdir(), "harness-git-"));
  const repo = join(dir, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "# Demo\n");
  writeFileSync(join(repo, "src", "app.js"), "export const value = 1;\n");
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["-c", "user.name=Test", "-c", "user.email=test@localhost", "add", "-A"]);
  git(repo, ["-c", "user.name=Test", "-c", "user.email=test@localhost", "commit", "-q", "-m", "init"]);
  return { dir, repo };
}
