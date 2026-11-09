# Housekeeping: Archive Accepted Sandbox Task

## Why

The work order `TASK-ANTIGRAVITY-SANDBOX.md` in `tasks/active/` has been formally reviewed, accepted, and summarized in `tasks/archive/TASK-ANTIGRAVITY-SANDBOX-SUMMARY.md`. According to `AGENTS.md` task workspace conventions, accepted work orders must be moved from `tasks/active/` into `tasks/archive/` while keeping their content intact.

Additionally, housekeeping requires verifying and reporting the purpose of `.continuity/test-state.json` and `.continuity/test-unit-state.json` without deleting them.

## Scope

- Move `tasks/active/TASK-ANTIGRAVITY-SANDBOX.md` intact into `tasks/archive/TASK-ANTIGRAVITY-SANDBOX.md`.
- Ensure `tasks/active/` is clean of accepted tasks.
- Keep `tasks/archive/TASK-ANTIGRAVITY-SANDBOX-SUMMARY.md` and `.gitkeep` in `tasks/archive/`.
- Document usage of `.continuity/test-unit-state.json` (used by `src/store.test.ts`) and `.continuity/test-state.json` (legacy baseline unit test state) without deleting any test state files.

## Out of scope

- Do not modify source code in `src/`.
- Do not modify tests or package files.
- Do not modify `.continuity/state.json` directly.
- Do not commit or push to Git.
