# Requirements

## Local workflow dashboard

The workspace SHALL provide a local React dashboard that presents the configured workspace's Continuity workflow as a lane visualization.

### Scenario: active change

- **WHEN** `.continuity/state.json` has an active change
- **THEN** the dashboard shows its tasks, current stage, pending checkpoint, and blockers

### Scenario: completed or idle workflow

- **WHEN** the workflow is idle
- **THEN** the dashboard shows the last available audit events and a clear idle state

## Read-only workspace API

The local dashboard API SHALL expose state and allowlisted workspace metadata without mutating workflow or source files.

### Scenario: path containment

- **WHEN** a client requests an artifact
- **THEN** the server returns it only when its resolved path is inside the configured workspace and matches an allowlisted artifact location

## Verification

The dashboard build and its API route tests SHALL run successfully through the project test command or an explicitly documented dashboard test command.
