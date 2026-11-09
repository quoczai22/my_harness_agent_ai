# Add Workflow Dashboard MVP

## Why

Continuity Core currently exposes workflow state only through MCP and JSON files. A local dashboard will make lanes, checkpoints, blockers, task artifacts, and test outcomes visible without copying long status reports through chat.

## Scope

- Add a local React dashboard for the current workspace.
- Add a read-only HTTP API that exposes Continuity state, Git summary, and selected report/test artifacts.
- Visualize a workflow lane with state transitions, checkpoints, tasks, blockers, and review status.
- Provide a workspace path configuration for the dashboard server.
- Keep MCP mutation and human approval actions outside the dashboard MVP.

## Out of scope

- No direct Codex or Antigravity dispatch, credential management, remote database, or production hosting.
- No dashboard-based checkpoint approvals or source edits.
- No commit or push.

## Risks

The dashboard reads local repository metadata and reports. Its API must be read-only and restricted to the configured workspace.
