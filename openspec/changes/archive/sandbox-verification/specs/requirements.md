# Requirements

## Continuity Core sandbox verification: stale-state resolution, lost-update protection, blocker gates, and multiprocess verification

### Scenario: Disk-fresh state reload
- **WHEN** any `Store` instance queries or mutates workflow state
- **THEN** it SHALL load the latest state fresh from the disk location specified by `CONTINUITY_STATE_PATH` (or default `.continuity/state.json`)
- **AND** it SHALL NOT rely on a stale in-memory cached state across invocations or across multiple instances.

### Scenario: Lost-update prevention
- **WHEN** state mutations are performed
- **THEN** changes SHALL be immediately written back to disk
- **AND** cross-process / cross-instance modifications SHALL be preserved without overwriting unobserved changes.

### Scenario: Discussion & Blocker gate
- **WHEN** a discussion or blocker is raised via `raiseDiscussion(topic, rationale)`
- **THEN** `topic` SHALL be added to `blockers` and logged in decisions
- **AND** `approveCheckpoint()` SHALL reject approval while any unresolved blockers exist
- **AND** `setStatus()` SHALL reject transitions to `IMPL_DONE` or `DONE` while blockers exist
- **WHEN** `resolveDiscussion(topic, resolution)` is called
- **THEN** `topic` SHALL be removed from `blockers` and logged in decisions
- **AND** `approveCheckpoint()` SHALL succeed once blockers are cleared.

### Scenario: Isolated Multiprocess OS Verification
- **WHEN** automated tests execute
- **THEN** three distinct Node OS processes with different PIDs (Process A, Process B, Process C) SHALL verify sequential state creation, update, and confirmation
- **AND** tests SHALL use an isolated temporary test state path without modifying or touching the production `.continuity/state.json`.
