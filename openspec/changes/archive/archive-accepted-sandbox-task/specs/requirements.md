# Requirements

## Housekeeping: Archive Accepted Sandbox Task

### Scenario: Relocate accepted work order to archive
- **WHEN** the housekeeping change is executed after approval
- **THEN** `tasks/active/TASK-ANTIGRAVITY-SANDBOX.md` SHALL be moved intact to `tasks/archive/TASK-ANTIGRAVITY-SANDBOX.md`
- **AND** `tasks/archive/TASK-ANTIGRAVITY-SANDBOX-SUMMARY.md` SHALL remain preserved
- **AND** `tasks/active/` SHALL contain no obsolete accepted work orders.

### Scenario: Preserve test state files
- **WHEN** analyzing test state files
- **THEN** neither `.continuity/test-state.json` nor `.continuity/test-unit-state.json` SHALL be deleted
- **AND** their respective test usages SHALL be documented in the handoff report.
