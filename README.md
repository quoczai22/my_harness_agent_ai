# Local agent harness

This workspace combines a lightweight, portable workflow with a local MCP server.

- **RTK**: optional command-output compression for coding agents.
- **Continuity Core**: local JSON-backed state machine enforcing the sequence: spec → human review → implementation → human review.
- **OpenSpec-style records**: durable, readable change contracts under `openspec/changes/`.

## Setup

```powershell
npm install
npm test
```

Register the built server with an MCP client using the absolute paths in `continuity.config.example.json`. Both clients must use the same `CONTINUITY_STATE_PATH`.

For Codex, add an equivalent `continuity` MCP-server entry to its configuration. For Antigravity, add the same command and environment to its project MCP settings. The server communicates only over stdio and persists state locally.

## RTK (optional)

Download the current Windows binary from the RTK release page, add `rtk.exe` to `PATH`, then run:

```powershell
rtk init -g --codex
rtk init --agent antigravity
rtk gain
```

RTK reduces shell output, not all conversation or model tokens. Keep its raw-output recovery enabled for failed commands.

## Multi-Workspace Dashboard & Registry

The Continuity dashboard provides a local, read-only web interface for monitoring workflow stages, active changes, and allowlisted artifacts.

```powershell
# Run with single workspace
node dist/dashboard.js --workspace "D:\Projects\my-project" --port 3456

# Run with an allowed multi-workspace registry
node dist/dashboard.js --registry ".continuity/workspaces.json"
# or short alias
node dist/dashboard.js -r ".continuity/workspaces.json"
```

For setup instructions, schema specifications, and fail-fast validation rules, see [.continuity/REGISTRY.md](file:///.continuity/REGISTRY.md) and template [.continuity/workspaces.example.json](file:///.continuity/workspaces.example.json).
