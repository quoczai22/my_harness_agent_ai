# Design

`deferChange(reason)` is permitted only for an active non-checkpoint stage, records a decision audit entry, preserves active tasks under the deferred change, clears the active change, and returns state to IDLE. It rejects empty reasons and pending checkpoints.
