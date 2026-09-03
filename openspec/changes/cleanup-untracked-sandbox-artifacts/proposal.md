# Workspace task structure setup and work order relocation

## Why

The workspace contains a root-level work order (`TASK-ANTIGRAVITY-SANDBOX.md`) and lacks standard directory conventions for managing active versus archived work orders. Establishing `tasks/active/` and `tasks/archive/` clarifies task lifecycles without prematurely deleting in-progress specifications.

## Scope

- Create `tasks/active/` for active work orders.
- Create `tasks/archive/` for accepted/completed task summaries.
- Move `TASK-ANTIGRAVITY-SANDBOX.md` intact into `tasks/active/TASK-ANTIGRAVITY-SANDBOX.md`.
- Update `AGENTS.md` to document the `tasks/active/` and `tasks/archive/` workflow convention.
- Keep `TASK-ANTIGRAVITY-SANDBOX.md` in `tasks/active/` (do not archive as it is not yet accepted).

## Out of scope

- Do not alter Continuity Core source code in `src/`.
- Do not commit or push to Git.
- Do not archive or modify the contents of `TASK-ANTIGRAVITY-SANDBOX.md`.

## Risk

Minimal. Moving untracked markdown documents and updating documentation does not affect runtime application logic.
