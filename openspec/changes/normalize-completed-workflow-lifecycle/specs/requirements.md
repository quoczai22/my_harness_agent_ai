# Requirements

- Approving an `impl_review` checkpoint SHALL mark all tasks belonging to that change as `completed`.
- The same atomic operation SHALL leave `stage` as `IDLE` and `currentChangeId` as `null`.
- Approved checkpoints, decisions, and historical tasks SHALL remain persisted for audit.
- Rejecting an implementation-review checkpoint SHALL retain active task state and return to `IMPL_IN_PROGRESS`.
- A new change SHALL be registerable immediately after an approved implementation review.
- Tests SHALL cover the complete lifecycle and fresh-state visibility across independent Store instances.
