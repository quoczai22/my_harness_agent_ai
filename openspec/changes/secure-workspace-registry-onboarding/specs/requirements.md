# Requirements

## Registry Template & Documentation

- The codebase SHALL provide `.continuity/workspaces.example.json` demonstrating valid JSON syntax and properties for onboarding multiple workspaces.

## Registry Schema Validation

- Registry loading SHALL validate that the root structure contains a non-empty `workspaces` array.
- Each entry in `workspaces` SHALL contain non-empty string fields `id`, `name`, and `path`.
- Registry loading SHALL reject duplicate `id` values with a descriptive error.
- Registry loading SHALL reject duplicate canonical `path` values with a descriptive error.
- Optional `port` values SHALL be validated as integers between 0 and 65535; invalid port types or ranges SHALL be rejected.

## Explicit vs Default Registry Error Handling

- When an explicit registry path is specified via `--registry` / `-r` or `CONTINUITY_REGISTRY_PATH`:
  - Missing file, invalid JSON syntax, or schema violations SHALL throw an error before the server starts.
  - The server SHALL NOT silently fall back to default workspace mode when an explicit registry was requested.
- When no explicit registry path is specified and `.continuity/workspaces.json` is not found, the server SHALL use single-workspace default mode for `workspaceRoot`.

## Security Invariants

- The server SHALL bind exclusively to `127.0.0.1`.
- The server SHALL only accept GET and HEAD requests (all other methods return HTTP 405).
- The server SHALL NOT emit wildcard CORS headers (`Access-Control-Allow-Origin: *`).
- The server SHALL NOT crawl disks, scan filesystems for unlisted projects, or spawn processes.
- All artifact and state queries SHALL enforce `isPathContained(targetWorkspaceRoot, targetPath)`.
