# Design: Silence non-git workspace summary errors

## Technical approach

### Git command execution with stdio redirection
In `src/dashboard.ts`, `getGitSummary(workspaceRoot)` currently runs:
```ts
execSync("git branch --show-current", { cwd: workspaceRoot, encoding: "utf8" });
execSync("git status --porcelain", { cwd: workspaceRoot, encoding: "utf8" });
```
When `stdio` is not explicitly redirected or ignored, Node's `execSync` defaults or inherits stderr behavior which prints fatal Git messages to console before throwing.
By specifying `stdio: ["ignore", "pipe", "ignore"]` (or capturing stdio with `stdio: "pipe"` and handling error silently in the catch block), Git child processes write nothing to inherited terminal streams on failure.

### Safe Fallback Response
When a directory is not a Git repository or Git commands fail:
- Return `{ branch: "unknown", clean: true, modifiedFiles: [] }`.
- Status is safely serialized into JSON for `GET /api/git` and workspace registry overview.

### Security and containment invariants
- **Read-only**: No write endpoints or state mutations.
- **Loopback binding**: `127.0.0.1` only.
- **Method filtering**: GET and HEAD only; non-GET/HEAD return 405.
- **Zero wildcard CORS**: No permissive `Access-Control-Allow-Origin: *`.
- **Per-workspace containment**: Path validation with `isPathContained()` remains enforced.

## Verification plan
1. Unit tests in `src/dashboard.test.ts` creating a temporary non-git directory and asserting `getGitSummary()` returns `{ branch: "unknown", clean: true, modifiedFiles: [] }` without emitting to stderr.
2. Endpoint integration test querying `GET /api/git?workspace=<non-git-workspace-id>` and asserting 200 OK with valid JSON response.
3. Regression test verifying valid Git repositories continue to report accurate branch name and modified files.
4. Run full test suite `npm test` and verify zero unsuppressed `fatal: not a git repository` messages in test output.
