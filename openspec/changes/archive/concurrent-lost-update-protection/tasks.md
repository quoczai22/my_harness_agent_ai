# Tasks

- [x] Implement cross-process file-locking synchronization (`withLock`) in `src/store.ts` to protect all mutations from concurrent lost updates. Keywords: `store.ts`, `withLock`, `acquireLock`, `releaseLock`.
- [x] Add concurrent multi-process automated tests in `src/concurrent.test.ts` verifying simultaneous writes across multiple independent Node processes with zero data loss. Keywords: `concurrent.test.ts`, `child_process`, `Promise.all`, `npm test`.
- [x] Verify full test suite execution (sequential multi-process, concurrent multi-process, unit tests) via `npm test`. Keywords: `npm test`, `multiprocess.test.ts`, `store.test.ts`.
