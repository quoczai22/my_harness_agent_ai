# Design: Multi-workspace dashboard launcher

## CLI argument parsing & validation

When `src/dashboard.ts` is executed as the entrypoint CLI:
1. Parse CLI flags:
   - `--workspace <path>` / `-w <path>`: overrides `CONTINUITY_WORKSPACE_PATH` and `process.cwd()`.
   - `--port <number>` / `-p <number>`: overrides `PORT` and default `3456`.
2. Validation before server startup:
   - Workspace validation: `existsSync(resolvedPath)` and `statSync(resolvedPath).isDirectory()`. If invalid or nonexistent, output a clear error message and exit with non-zero status without opening a network listener.
   - Port validation: parse integer and check `port >= 1 && port <= 65535`. If invalid (NaN, out of range, negative), output a clear error message and exit with non-zero status without opening a network listener.

## Programmatic API compatibility

`createDashboardServer(options?: DashboardOptions)` continues to accept `{ workspaceRoot?: string, port?: number }` with graceful precedence:
- `options.workspaceRoot ?? cliWorkspace ?? process.env.CONTINUITY_WORKSPACE_PATH ?? process.cwd()`.
- `options.port ?? cliPort ?? (process.env.PORT ? parseInt(process.env.PORT, 10) : 3456)`.

## Security & isolation architecture

- **Loopback binding**: Server binds strictly to `127.0.0.1`.
- **Read-only enforcement**: Rejects non-GET/HEAD methods with `405 Method Not Allowed`.
- **Decoupled assets**: `/bundle.js` resolves exclusively from fixed module installation directory (`dist/public/bundle.js`).
- **Workspace data containment**: `/api/state`, `/api/artifacts`, and `/api/git` strictly operate within the configured `workspaceRoot` using segment-aware `isPathContained()`. Traversal (`..`) or external paths return `403 Access Denied`.
