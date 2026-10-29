# Work Order: Cleanup Concurrent Test Artifacts

## Objective

Ensure the Core concurrent multi-process test never leaves test-owned state, lock, or atomic-save temporary files in `.continuity/`.

## Constraints

- Keep cleanup strictly scoped to that test's unique prefix.
- Do not alter production state or locking semantics.
- Do not commit or push.

## Acceptance

- Core tests pass with the existing 50-mutation, two-process assertion.
- Test-owned artifacts are absent after both normal and failure-path cleanup.
