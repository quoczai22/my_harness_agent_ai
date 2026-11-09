# Multi-workspace workflow timeline

## Problem

When developers manage multiple workspaces, tracking recent workflow progression (checkpoints requested, checkpoints approved/rejected, decisions logged, and stage transitions) requires manually scanning fragmented data fields. Developers need a unified chronological timeline for the active workspace and a concise recent-activity summary on workspace cards in the registry overview. This timeline must be generated deterministically, bounded in size to prevent UI performance issues, and confined strictly to registered workspace state.

## Scope

- Implement deterministic workflow timeline aggregation from `.continuity/state.json`:
  - Merge checkpoint creations, checkpoint decisions, and decision audit logs into unified chronological timeline events.
  - Sort events in descending chronological order (newest first) with a bounded event limit (default 20, max 50) to keep payloads lightweight.
  - Provide a read-only `GET /api/timeline` endpoint (with `?workspace=<id>&limit=<n>`).
  - Include a concise recent activity snippet in `/api/workspaces` summary cards.
- Security and Containment:
  - Only read `.continuity/state.json` inside explicitly registered workspaces.
  - Reject unregistered workspaces with HTTP 403.
  - Handle missing, empty, or malformed state files safely without crashing (return empty timeline or safe 404).
  - Enforce `isPathContained(targetWorkspaceRoot, statePath)`.
- Update Offline React UI:
  - Add a dedicated Chronological Workflow Timeline component for the active workspace.
  - Show recent event summary badges on workspace registry cards.
- Preserve all existing invariants:
  - Strictly read-only: no state modification, no registry write, no mutation endpoints (405 for non-GET/HEAD).
  - Loopback-only (`127.0.0.1`), zero wildcard CORS.
  - No process spawning, daemon management, or disk scanning.

## Out of scope

- Writing or deleting timeline events via API.
- Tailing external log files or system process journals.
