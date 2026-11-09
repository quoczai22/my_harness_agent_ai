# Tasks

- [x] Update `setStatus` in `src/store.ts` to reject any stage transition whenever unresolved blockers exist. Keywords: `store.ts`, `setStatus`, `blockers`, `VALID_TRANSITIONS`.
- [x] Add regression tests in `src/store.test.ts` verifying `setStatus` throws on any transition while blockers exist and succeeds once resolved. Keywords: `store.test.ts`, `setStatus`, `raiseDiscussion`, `resolveDiscussion`.
- [x] Verify full test suite execution via `npm test`. Keywords: `npm test`, `store.test.ts`, `multiprocess.test.ts`.
