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

The Continuity dashboard opens as **Harness Atlas**, a local CodeAtlas-style project cockpit. It can register any folder you explicitly choose, index safe text files, visualize an evidence-derived Project Flow, show the Harness execution flow, and keep chat sessions isolated per project. Antigravity CLI is connected in sandboxed proposal mode: it receives only the bounded safe context you select, returns chat plus read-only file proposals, and never applies changes automatically.

```powershell
# Build and open the current repository at http://127.0.0.1:3456
npm run dashboard -- --workspace "D:\Projects\my-project" --port 3456

# Run with single workspace
node dist/dashboard.js --workspace "D:\Projects\my-project" --port 3456

# Run with an allowed multi-workspace registry
node dist/dashboard.js --registry ".continuity/workspaces.json"
# or short alias
node dist/dashboard.js -r ".continuity/workspaces.json"
```

In the browser, use **Choose workspace** to open the Windows folder picker. A chosen folder is saved locally in `.continuity/workspaces.local.json` and appears immediately in the project selector. On systems without the native picker, enter an absolute folder path in the fallback field.

Use the **Sáng / Tối / Hệ thống** control in the header to change appearance. The selection is stored only in browser localStorage; System mode follows the operating-system color preference.

Antigravity is discovered from `agy` on `PATH` or `%LOCALAPPDATA%\agy\bin\agy.exe`. Passive discovery only runs `agy --version`; quota is consumed only after you click **Test connection** or **Send to Antigravity**. Every Harness session stores its own Antigravity conversation id, so changing sessions or workspaces does not mix chat context.

For registry schema and fail-fast validation rules, see `.continuity/REGISTRY.md` and `.continuity/workspaces.example.json`.
