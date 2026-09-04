# Requirements

## Timeline Aggregation & Sorting

- The server SHALL extract chronological timeline events from `.continuity/state.json` combining checkpoint requests, checkpoint decisions, and audit decisions.
- Timeline events SHALL be sorted deterministically in descending chronological order (newest first).
- The number of timeline events SHALL be bounded by a clamped limit (default 20, max 50).

## Endpoint & Workspace Isolation

- `GET /api/timeline` SHALL return `{ events: TimelineEvent[] }` for the specified or default workspace.
- `GET /api/timeline?workspace=<id>` SHALL validate that `<id>` belongs to the registered workspaces allowlist.
- Unregistered workspace queries SHALL return HTTP 403.
- Target state files SHALL be validated with `isPathContained(targetWorkspaceRoot, statePath)`.
- If the target workspace directory or state file is missing or malformed, the server SHALL return a safe response (empty events or HTTP 404) without crashing.

## UI & Server Invariants

- The React dashboard UI SHALL render a chronological timeline view for the active workspace.
- Workspace summary cards SHALL display a concise recent activity status.
- The server SHALL bind strictly to `127.0.0.1`.
- The server SHALL reject all mutation HTTP methods (POST, PUT, DELETE, PATCH) with HTTP 405.
- The server SHALL NOT send wildcard CORS headers.
- The server SHALL NOT spawn processes, manage daemons, or scan the filesystem.
