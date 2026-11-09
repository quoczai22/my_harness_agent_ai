# Continuity Core sandbox verification: stale-state resolution, discussion gates, and multiprocess validation

## Why

1. `Store` cached state in memory upon instantiation without reloading fresh disk state before operations, causing stale cache and lost updates when multiple instances or external processes modify `.continuity/state.json`.
2. `approveCheckpoint()` lacked gating on active discussions/blockers, permitting checkpoint approvals even with unresolved blockers.
3. The test suite lacked multi-process OS testing to verify cross-process state handoff across distinct Node OS processes with different PIDs.

## Scope

- Refactor `src/store.ts` to reload state fresh from disk before all queries and mutations.
- Implement `raiseDiscussion(topic, rationale)` and `resolveDiscussion(topic, resolution)` in `src/store.ts`.
- Update `approveCheckpoint` and `setStatus` to enforce blocker resolution before proceeding.
- Expose discussion tools in `src/index.ts`.
- Add comprehensive unit tests in `src/store.test.ts` for discussion blocker gate and multi-instance cache freshness.
- Add multi-process OS tests in `src/multiprocess.test.ts` validating state creation, update, and confirmation across three separate Node OS processes with distinct PIDs using a temporary test state file.
- Verify complete test suite with `npm test`.

## Out of scope

- Do not modify or overwrite `.continuity/state.json` during automated tests.
- Do not commit or push to Git.
- Do not modify files outside the sandbox verification scope.
