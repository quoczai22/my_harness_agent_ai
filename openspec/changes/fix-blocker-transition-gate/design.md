# Design: Universal Blocker Guard in `setStatus`

## 1. Guard Update (`src/store.ts`)
In `Store.prototype.setStatus`:
Replace:
```typescript
if (state.blockers.length > 0 && (next === "IMPL_DONE" || next === "DONE")) {
  throw new Error(`Cannot advance status while blockers exist: ${state.blockers.join(", ")}`);
}
```
With:
```typescript
if (state.blockers.length > 0) {
  throw new Error(`Cannot change status while blockers exist: ${state.blockers.join(", ")}`);
}
```

## 2. Regression Testing (`src/store.test.ts`)
- Test scenario:
  1. Set up a change in a valid stage (e.g., `IMPL_IN_PROGRESS` or a valid stage allowing a transition).
  2. Call `raiseDiscussion("test-blocker", "Issue needs discussion")`.
  3. Attempt a valid `setStatus` transition (e.g. `IMPL_DONE` or any valid transition).
  4. Assert that `setStatus` throws with error message matching `/blocker/i`.
  5. Call `resolveDiscussion("test-blocker", "Resolved")`.
  6. Call `setStatus` again and assert that it successfully transitions to the next stage.
