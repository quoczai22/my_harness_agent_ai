# Tasks

- [x] Refactor `Store` in `src/store.ts` to reload state fresh from disk before all operations, fixing stale cache and preventing lost updates. Keywords: `store.ts`, `load`, `persist`, `CONTINUITY_STATE_PATH`.
- [x] Implement `raiseDiscussion`, `resolveDiscussion`, and blocker gating in `src/store.ts` and expose them in `src/index.ts`. Keywords: `store.ts`, `index.ts`, `raiseDiscussion`, `resolveDiscussion`, `blockers`.
- [x] Add unit tests and multi-process OS tests with independent PIDs across processes A, B, and C in `src/multiprocess.test.ts` and `src/store.test.ts`, verified via `npm test`. Keywords: `store.test.ts`, `multiprocess.test.ts`, `npm test`, `child_process`.
