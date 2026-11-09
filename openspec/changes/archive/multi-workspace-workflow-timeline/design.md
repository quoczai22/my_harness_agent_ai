# Design: Multi-workspace workflow timeline

## Timeline Data Structures

```ts
export interface TimelineEvent {
  id: string;
  type: "CHECKPOINT_REQUESTED" | "CHECKPOINT_DECIDED" | "DECISION" | "STAGE_CHANGE";
  timestamp: string;
  title: string;
  description: string;
  actor?: string;
  badgeVariant: "purple" | "blue" | "green" | "amber" | "rose";
}
```

## Deterministic Timeline Extraction

Implement `extractWorkflowTimeline(state: any, limit = 20): TimelineEvent[]`:
1. **Checkpoint Events**:
   - For each checkpoint in `state.checkpoints`:
     - Creation event: `timestamp = c.createdAt`, `type = "CHECKPOINT_REQUESTED"`, `title = "Checkpoint Requested: " + c.type`, `description = c.payload`.
     - Decision event (if `c.decidedAt`): `timestamp = c.decidedAt`, `type = "CHECKPOINT_DECIDED"`, `title = "Checkpoint " + c.status`, `description = c.reasoning || ""`.
2. **Decision Events**:
   - For each entry in `state.decisions`:
     - `timestamp = d.timestamp`, `type = "DECISION"`, `title = d.decision`, `actor = d.actor`, `description = d.reasoning`.
3. **Sorting & Clamping**:
   - Sort by `Date.parse(b.timestamp) - Date.parse(a.timestamp)` (descending, newest first).
   - If timestamps are equal, sort deterministically by `id`.
   - Slice array to `Math.min(Math.max(1, limit), 50)`.

## Endpoint & Query Resolution

- `GET /api/timeline`:
  - `workspace` query param: resolves registered workspace canonical path, checks containment.
  - `limit` query param: clamped between 1 and 50 (default 20).
  - Unregistered workspace returns HTTP 403.
  - Unavailable workspace / missing state returns HTTP 404 or empty `{ events: [] }`.

## Summary Integration in Workspace Overview

- `WorkspaceSummary` extended with `recentActivity?: string`:
  - Returns the latest timeline event title and relative time (or `"No recent activity"`).

## UI Component in `src/ui/App.tsx`

- Timeline section rendering events in chronological order with visual timeline connectors, icons/badges, timestamps, and actor/reasoning text.
- Workspace overview cards display recent activity snippet.

## Security & Invariants

- **Read-only**: 100% GET/HEAD only; mutation HTTP methods return 405.
- **Loopback-only**: Bound to `127.0.0.1`.
- **Zero wildcard CORS**: No `Access-Control-Allow-Origin: *`.
- **Containment per workspace**: `isPathContained` enforced on `.continuity/state.json`.
- **No process spawning / no disk scanning**.
