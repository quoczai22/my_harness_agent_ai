# Requirements

## Git Summary Stderr Silence

- `getGitSummary(workspaceRoot)` SHALL execute Git commands with stdio redirection to prevent `fatal: not a git repository` from printing to stderr or terminal when target directories are not Git repositories.
- `getGitSummary(workspaceRoot)` SHALL return `{ branch: "unknown", clean: true, modifiedFiles: [] }` when Git command execution fails or the workspace is not a Git repo.
- `getGitSummary(workspaceRoot)` SHALL continue returning accurate branch name and file modification details when the workspace is a valid Git repository.

## Endpoint & Security Invariants

- `GET /api/git` (and `GET /api/git?workspace=<id>`) SHALL return valid JSON with `branch`, `clean`, and `modifiedFiles` for both Git and non-Git registered workspaces.
- The server SHALL maintain loopback binding on `127.0.0.1`.
- The server SHALL reject all mutation HTTP methods (POST, PUT, DELETE, PATCH) with HTTP 405.
- The server SHALL NOT send wildcard CORS headers.
- The server SHALL NOT spawn daemon processes or agent dispatchers.
