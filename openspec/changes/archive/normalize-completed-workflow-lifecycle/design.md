# Design

When `approveCheckpoint` approves an `impl_review` checkpoint, it will run under the existing cross-process lock and mutate the freshly loaded state in one transaction:

1. Mark every task of that change as `completed`.
2. Preserve the approved checkpoint and reviewer decision in the audit log.
3. Clear `currentChangeId` and set `stage` to `IDLE`.

Rejected implementation reviews continue to return the current change to `IMPL_IN_PROGRESS` without marking tasks completed. Tests will cover approval, rejection, audit retention, and immediate registration of a subsequent change.
