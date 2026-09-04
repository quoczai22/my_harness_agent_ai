# Requirements

## Registry Schema & Validation

- The registry SHALL store an explicit list of user-allowed workspaces with `id`, `name`, `path`, and optional `port`.
- The server SHALL resolve registry path from `--registry`, `CONTINUITY_REGISTRY_PATH`, or default `.continuity/workspaces.json`.
- The server SHALL NOT scan the filesystem or crawl directories outside explicitly listed workspace paths.
- Registered paths SHALL be validated for directory existence; missing workspaces SHALL be marked `UNAVAILABLE` without crashing the server.

## Read-only Multi-Workspace Endpoints

- `GET /api/workspaces` SHALL return the list of allowed workspaces with their summary metadata.
- Workspace data routes SHALL accept a workspace identifier or parameter and validate that the target belongs to the allowed registry.
- Target workspace state and artifact reads SHALL strictly enforce `isPathContained(workspaceRoot, targetPath)`.
- Requests attempting traversal (`..`) or referencing unlisted/external directories SHALL return HTTP 403.

## Server Constraints & UI

- The server SHALL bind strictly to `127.0.0.1`.
- The server SHALL reject all write/mutation requests (POST, PUT, DELETE, PATCH) with HTTP 405.
- The server SHALL NOT set any wildcard CORS (`Access-Control-Allow-Origin: *`) header.
- The UI SHALL operate 100% offline using the local esbuild bundle from the module installation path.
