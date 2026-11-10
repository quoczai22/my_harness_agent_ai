import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  changedFiles, commitAll, createRunWorktree, git, globToRegExp, hasUncommittedChanges, matchesAny,
  removeRunWorktree, repositoryRoot, revertFiles, worktreeDiff,
} from "./gitWorktree.js";
import { makeTempRepo } from "./testSupport.js";


test("a run worktree isolates writes, reverts out-of-scope files and commits to its branch", () => {
  const { dir, repo } = makeTempRepo();
  try {
    assert.equal(repositoryRoot(join(repo, "src")), repo);
    const worktree = join(dir, "wt");
    createRunWorktree(repo, worktree, "harness/run-1");

    writeFileSync(join(worktree, "src", "app.js"), "export const value = 2;\n");
    writeFileSync(join(worktree, "src", "new.js"), "export {};\n");
    writeFileSync(join(worktree, "README.md"), "changed\n");
    mkdirSync(join(worktree, "stray"));
    writeFileSync(join(worktree, "stray", "x.txt"), "x");

    const changed = changedFiles(worktree).map((f) => f.path).sort();
    assert.deepEqual(changed, ["README.md", "src/app.js", "src/new.js", "stray/x.txt"]);

    const outOfScope = changed.filter((path) => !matchesAny(path, ["src/**"]));
    revertFiles(worktree, outOfScope);
    assert.equal(readFileSync(join(worktree, "README.md"), "utf8"), "# Demo\n");
    assert.equal(existsSync(join(worktree, "stray", "x.txt")), false);

    assert.match(worktreeDiff(worktree), /src\/new\.js/);
    const sha = commitAll(worktree, "harness: task T1");
    assert.match(sha ?? "", /^[0-9a-f]{40}$/);
    assert.equal(commitAll(worktree, "nothing"), null);

    // The imported repository's working tree and branch are untouched.
    assert.equal(readFileSync(join(repo, "src", "app.js"), "utf8"), "export const value = 1;\n");
    assert.equal(hasUncommittedChanges(repo), false);
    assert.equal(git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim(), "main");
    assert.equal(git(repo, ["log", "-1", "--format=%s", "harness/run-1"]).stdout.trim(), "harness: task T1");

    removeRunWorktree(repo, worktree);
    assert.equal(existsSync(worktree), false);
    assert.equal(git(repo, ["rev-parse", "--verify", "harness/run-1"]).code, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("worktree helpers refuse unsafe input", () => {
  const { dir, repo } = makeTempRepo();
  try {
    assert.throws(() => createRunWorktree(repo, join(dir, "wt"), "main"), /INVALID_BRANCH/);
    assert.throws(() => revertFiles(repo, ["../outside.txt"]), /UNSAFE_PATH/);
    assert.throws(() => repositoryRoot(dir), /NOT_A_GIT_REPOSITORY/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("glob patterns follow allowedFiles conventions", () => {
  assert.equal(globToRegExp("src/**").test("src/a/b.ts"), true);
  assert.equal(globToRegExp("src/*.ts").test("src/a/b.ts"), false);
  assert.equal(globToRegExp("src/*.ts").test("src/b.ts"), true);
  assert.equal(globToRegExp("**/*.css").test("styles/x/y.css"), true);
  assert.equal(globToRegExp("**/*.css").test("y.css"), true);
  assert.equal(globToRegExp("ui/").test("ui/App.tsx"), true);
  assert.equal(matchesAny("README.md", ["src/**", "README.md"]), true);
});
