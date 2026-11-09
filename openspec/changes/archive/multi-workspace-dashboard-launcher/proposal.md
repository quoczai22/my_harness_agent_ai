# Multi-workspace dashboard launcher (Phase B)

## Problem

The Continuity Core Dashboard server defaults to the current working directory or `CONTINUITY_WORKSPACE_PATH` and a fixed port `3456` or `PORT`. To inspect multiple distinct local workspaces independently, developers need explicit CLI options (`--workspace` and `--port`) allowing individual dashboard instances to target specific project workspaces and ports without modifying system environment variables or conflicting with each other.

## Scope

- Parse `--workspace <path>` and `--port <number>` CLI arguments when invoking `dashboard.js`.
- Preserve existing environment variable fallbacks (`CONTINUITY_WORKSPACE_PATH`, `PORT`, `process.cwd()`).
- Validate that the specified workspace path exists and is a directory before listening.
- Validate that the specified port is a valid port integer (1 - 65535) before listening.
- Single workspace per instance: each dashboard process strictly serves one workspace on its assigned loopback port.
- Maintain module-relative offline `/bundle.js` resolution independent of target workspace.
- Enforce strict workspace containment (`isPathContained`) for all workspace data (`/api/state`, `/api/artifacts`, `/api/git`).
- Retain strict read-only enforcement (GET/HEAD only), loopback `127.0.0.1` binding, and zero wildcard CORS.

## Out of scope

- Multi-project selector or aggregator inside a single dashboard UI.
- Agent dispatch, background worker spawning, or write endpoints.
- Remote hosting, cloud deployment, authentication, or remote database synchronization.
