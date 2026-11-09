# Concurrent Mutation & Lost-Update Protection Design

## 1. Synchronization Architecture (`src/store.ts`)

### Atomic Lock Acquisition & Lifecycle (`withLock`)
- **Lock Path**: `${getStatePath()}.lock`.
- **Acquisition**: `fs.openSync(lockPath, "wx")` creates the lock file exclusively at the OS level.
- **Payload**: Writes `{ pid: process.pid, createdAt: Date.now() }`.
- **Bounded Retry**: If `EEXIST`, retries with randomized jitter (10ms-30ms) up to `5000ms` timeout.
- **Stale Lock Safety**: When lock age > 10,000ms, verifies whether `pid` is alive via `process.kill(pid, 0)`. If process is dead (`ESRCH`), safely reclaims lock; if process is alive, waits.
- **Release**: Closes file descriptor and deletes `${getStatePath()}.lock` in a `finally` block.

### Atomic State Persistence
- All state saves write to a temporary file `${statePath}.${process.pid}.${Date.now()}.tmp` first, followed by `fs.renameSync(tempPath, statePath)` to prevent torn writes.

## 2. Protected Mutation Surface
All mutations execute inside `withLock`:
- `registerTask`
- `requestCheckpoint`
- `approveCheckpoint`
- `checkScope`
- `setStatus`
- `logDecision`
- `raiseDiscussion`
- `resolveDiscussion`

## 3. Concurrent Automated Testing (`src/concurrent.test.ts`)
- Spawns two independent Node OS child processes in parallel on an isolated test state path (`.continuity/test-concurrent-state.json`).
- Each process performs 25 interleaved mutations under high contention.
- Verifies that all 50 mutations exist in final state (zero lost updates).
