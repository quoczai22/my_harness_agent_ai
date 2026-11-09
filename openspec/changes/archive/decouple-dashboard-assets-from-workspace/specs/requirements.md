# Requirements

## Asset isolation

- The `/bundle.js` route SHALL serve the fixed dashboard bundle from the dashboard installation directory.
- Asset-path resolution SHALL not depend on query input, headers, CLI input, or `workspaceRoot`.
- `/bundle.js` SHALL return 200 for valid, different, and nonexistent workspace roots when the installed bundle exists.

## Workspace-data safety

- Artifact routes SHALL continue to use `isPathContained()` with `workspaceRoot` as their root.
- Artifact traversal and reads of files outside the target workspace SHALL return 403.
- The change SHALL add no write endpoint, retain `127.0.0.1` binding, and retain no wildcard CORS header.
