# Silence non-git workspace summary errors

## Problem

When the multi-workspace dashboard registry includes workspaces or directories that are not Git repositories (e.g. documentation-only folders, newly initialized projects without git, or test fixture directories), executing Git inspection commands via `execSync` emits `fatal: not a git repository (or any of the parent directories): .git` to `stderr` / terminal. While `getGitSummary()` catches the exception and returns a fallback object, the unsuppressed stderr pollutes the console and test logs.

## Scope

- Ensure Git execution in `getGitSummary(workspaceRoot)` suppresses unhandled `stderr` noise (e.g., using `stdio: ["ignore", "pipe", "ignore"]` or `stdio: "pipe"` with safe error handling) when inspecting directories that are not Git repositories.
- Return safe Git summary defaults (`{ branch: "unknown", clean: true, modifiedFiles: [] }`) when Git inspection fails or when the target is not a Git repository.
- Ensure `GET /api/git?workspace=<registered-non-git-workspace>` returns valid JSON without writing fatal errors to `stderr`.
- Verify existing Git repositories continue to report accurate branch names, cleanliness status, and modified files.
- Maintain existing constraints: local read-only registry, loopback-only (`127.0.0.1`), GET/HEAD only, no wildcard CORS, no process spawning/daemon, no write endpoints, and per-workspace containment.
- Add security and regression tests for non-git workspaces and silent stderr in `src/dashboard.test.ts`.

## Out of scope

- Initializing Git repositories on behalf of the user.
- Adding Git write operations (commit, checkout, push, pull).
- Scanning disks for Git repositories.
