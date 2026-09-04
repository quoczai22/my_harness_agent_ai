# Decouple dashboard assets from workspace containment

## Problem

The local dashboard correctly confines workspace data to `workspaceRoot`, but the React bundle is currently subject to that same containment check. When a caller supplies a different or nonexistent workspace root, `/bundle.js` can fail even though dashboard assets are independent of workspace data.

## Scope

Phase A only: serve static dashboard assets from the dashboard installation directory through a separate code path. Preserve all existing read-only workspace-data behavior.

## Out of scope

- Multi-instance CLI support.
- `--workspace` or `--port` flags.
- Write endpoints, remote hosting, or cloud synchronization.
