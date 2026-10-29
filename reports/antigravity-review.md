# Continuity Core Lock & Concurrency Design Review

## Checklist Assessment

### 1. Atomic Lock Acquisition
- **Mechanism**: `fs.openSync(lockPath, 'wx')` provides OS-level atomic file creation.
- **Safety**: If the lock file exists, `openSync` fails immediately with `EEXIST` at the OS kernel level across processes.
- **Payload**: The lock file contains `{ pid: process.pid, createdAt: Date.now() }` for auditing and stale detection.

### 2. Bounded Retry & Exponential/Jitter Backoff
- **Parameters**: `timeoutMs = 5000ms`, `retryInterval = 10ms - 30ms` randomized jitter.
- **Behavior**: Uses synchronous loop with `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay)` or busy backoff loop.
- **Failure mode**: Throws a descriptive `TimeoutError` with lock holder PID and duration if exceeded.

### 3. Stale-Lock Recovery without Breaking Active Living Locks
- **Validation**: When `EEXIST` occurs, inspect `{ pid, createdAt }` and file `mtime`.
- **Liveness Check**: Before reclaiming a lock older than `STALE_THRESHOLD_MS` (10,000ms), execute `process.kill(pid, 0)`:
  - If `process.kill(pid, 0)` throws `ESRCH`: The owning process is definitely dead; safely unlink and reacquire.
  - If `process.kill(pid, 0)` succeeds: The process is still alive; do NOT break the lock, continue waiting.

### 4. Atomic State Persistence via Temp-File + Rename
- **Write Pattern**: Write serialized JSON to `${statePath}.${process.pid}.${Date.now()}.tmp`.
- **Commit**: Execute `fs.renameSync(tempPath, statePath)` ensuring atomic replacement on disk.

### 5. Overlapping Concurrent Writer Verification
- **Test Strategy**: Spawn 2 independent Node OS processes simultaneously via `Promise.all([spawn(P1), spawn(P2)])`.
- **Interleaving**: Each process executes 25 distinct mutations with interleaved randomized delays (5-15ms) to force maximum write contention.
- **Validation**: Parent process verifies final state contains exactly 50/50 entries with no lost updates.

## Status & Gate
- **Checkpoint ID**: `cp_1788448893872_a8t38` (`spec_review`)
- **Current Stage**: `CHECKPOINT_1` (PENDING)
- **Gate Status**: Source code in `src/` remains untouched awaiting human manager checkpoint approval.
