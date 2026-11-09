# Concurrent Lost-Update Protection in Continuity Core

## Why

While `Store` loads state fresh from disk before operations and writes back immediately, operations follow a separate `load()` then `save()` pattern without synchronization. When two independent OS processes mutate state concurrently:
1. Process A reads disk snapshot $S_0$.
2. Process B reads disk snapshot $S_0$.
3. Process A modifies its copy and writes $S_A$ to disk.
4. Process B modifies its copy and writes $S_B$ to disk, overwriting $S_A$ and causing updates from Process A to be lost.

To guarantee data integrity across concurrent processes, `Store` requires atomic synchronization or optimistic concurrency control (CAS / versioning with retries / cross-process file locking) for all mutation operations.

## Scope

- Implement synchronized write / atomic mutation mechanism (e.g. cross-process file lock or atomic mutation with CAS/retry loop) in `src/store.ts`.
- Ensure all mutation methods (`registerTask`, `requestCheckpoint`, `approveCheckpoint`, `checkScope`, `setStatus`, `logDecision`, `raiseDiscussion`, `resolveDiscussion`) execute atomically across multiple processes.
- Add concurrent multi-process automated tests in `src/concurrent.test.ts` (or `src/multiprocess.test.ts`) spawning multiple OS child processes executing simultaneous mutations on a dedicated temporary test state file.
- Verify that both concurrent updates are preserved (zero lost updates).
- Maintain existing sequential multi-process and unit tests.
- Verify all tests pass via `npm test`.

## Out of scope

- Do not modify `.continuity/state.json` during automated test execution.
- Do not commit or push to Git.
