# Requirements

## Universal Blocker Guard in `setStatus`

### Scenario: Rejecting any `setStatus` transition while blockers exist
- **WHEN** `state.blockers.length > 0`
- **AND** `setStatus(next, note, filesChanged)` is called for any target `next` stage
- **THEN** it SHALL throw an error indicating that status transitions are not allowed while blockers exist.

### Scenario: Allowing `setStatus` transitions after resolving blockers
- **WHEN** all blockers are resolved via `resolveDiscussion(topic, resolution)` such that `state.blockers.length === 0`
- **AND** a valid transition is attempted via `setStatus(next, note, filesChanged)`
- **THEN** it SHALL succeed and transition to the target stage.
