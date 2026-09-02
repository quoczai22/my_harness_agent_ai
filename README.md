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
