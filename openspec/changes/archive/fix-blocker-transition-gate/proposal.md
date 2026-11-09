# Fix Blocker Transition Gate in `setStatus`

## Why

In `src/store.ts`, `setStatus` currently only blocks transitions when `state.blockers.length > 0` AND the target stage is `IMPL_DONE` or `DONE`:
```typescript
if (state.blockers.length > 0 && (next === "IMPL_DONE" || next === "DONE")) {
  throw new Error(`Cannot advance status while blockers exist: ${state.blockers.join(", ")}`);
}
```
However, the discussion gate requirement specifies that **any** workflow stage transition via `setStatus` must be rejected if there are active unresolved blockers in `state.blockers`.

## Scope

- Update `setStatus` in `src/store.ts` to reject all transitions when `state.blockers.length > 0`.
- Add regression tests in `src/store.test.ts` verifying that non-terminal transitions (e.g. `IDLE` -> other valid transitions or intermediate transitions) throw when a blocker is active and succeed once resolved.
- Run `npm test` to ensure full test suite passes.

## Out of scope

- Do not modify files outside of `src/store.ts` and `src/store.test.ts`.
- Do not commit or push to Git.
