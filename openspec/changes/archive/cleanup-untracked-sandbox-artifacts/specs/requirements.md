# Requirements

## Workspace task structure setup and work order relocation

The workflow SHALL establish `tasks/active/` and `tasks/archive/` directories and relocate active work orders without altering their content.

### Scenario: Directory structure initialization
- **WHEN** the setup is applied
- **THEN** `tasks/active/` and `tasks/archive/` directories exist in the workspace root

### Scenario: Work order relocation
- **WHEN** `TASK-ANTIGRAVITY-SANDBOX.md` is moved
- **THEN** `tasks/active/TASK-ANTIGRAVITY-SANDBOX.md` exists with byte-identical content to the original `TASK-ANTIGRAVITY-SANDBOX.md`
- **AND** the root `TASK-ANTIGRAVITY-SANDBOX.md` is removed
- **AND** the work order is not archived to `tasks/archive/` because it is not yet accepted

### Scenario: Agent workflow documentation
- **WHEN** `AGENTS.md` is updated
- **THEN** it explicitly documents `tasks/active/` for active work orders and `tasks/archive/` for accepted task summaries

### Scenario: Preservation of product source
- **WHEN** the change is executed
- **THEN** no source code in `src/` is modified, and no git commit/push is performed
