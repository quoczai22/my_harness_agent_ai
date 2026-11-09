# Sandbox Verification Design

## 1. Disk-Fresh State Management (`src/store.ts`)
- Replace in-memory persistent caching with a dynamic loader helper `load(): ContextState` and updater helper `save(state: ContextState): void`.
- At the start of every store operation (`getStatus`, `registerTask`, `requestCheckpoint`, `approveCheckpoint`, `checkScope`, `setStatus`, `logDecision`, `raiseDiscussion`, `resolveDiscussion`), call `this.load()` to get the latest disk state.
- Write operations compute new state and persist immediately to disk, preventing lost-update anomalies between instances.
- Constructor only creates empty state file if none exists on disk, without clobbering existing state.

## 2. Discussion & Blocker Gate (`src/store.ts`, `src/index.ts`, `src/types.ts`)
- Add `raiseDiscussion(topic: string, rationale: string)`:
  - Appends `topic` to `this.state.blockers` if absent.
  - Logs decision `{ timestamp, actor: "system", decision: `raise_discussion:${topic}`, reasoning: rationale }`.
  - Persists state.
- Add `resolveDiscussion(topic: string, resolution: string)`:
  - Removes `topic` from `this.state.blockers`.
  - Logs decision `{ timestamp, actor: "reviewer", decision: `resolve_discussion:${topic}`, reasoning: resolution }`.
  - Persists state.
- Enforce in `approveCheckpoint`:
  - Throws an error if `this.state.blockers.length > 0`.

## 3. Multi-Process OS Test (`src/multiprocess.test.ts`)
- Create isolated temporary state path `.continuity/test-multiprocess-state.json`.
- Process A (PID 1): Spawns independent Node process to create state, register a task, request checkpoint, and exit.
- Process B (PID 2): Spawns independent Node process to read state produced by A, approve checkpoint, and update stage.
- Process C (PID 3): Spawns independent Node process to verify stage, scope check, and decision logs updated by B.
- Asserts unique PIDs, verifies clean execution, and cleans up temporary state file.
