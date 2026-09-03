# Housekeeping Design

## 1. Task Relocation
- Move file `tasks/active/TASK-ANTIGRAVITY-SANDBOX.md` to `tasks/archive/TASK-ANTIGRAVITY-SANDBOX.md` preserving exact byte content.
- Leave `tasks/active/` ready for future in-progress work orders.
- Maintain `tasks/archive/TASK-ANTIGRAVITY-SANDBOX-SUMMARY.md` alongside the archived work order.

## 2. Test State Artifact Analysis
- `.continuity/test-unit-state.json`: Active test state path used by `src/store.test.ts` for unit test suites (checkpoint enforcement, blocker gates, multi-instance freshness).
- `.continuity/test-state.json`: Original baseline test state path before unit test suite specialization.
- Retention: Both files remain in `.continuity/` without deletion.
