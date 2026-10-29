# Requirements

- Deferral SHALL require a non-empty reason and SHALL be audited.
- Deferral SHALL reject pending checkpoint stages.
- Deferral SHALL preserve prior change tasks and never mark them done.
- A deferred change SHALL release the workflow to IDLE for a new change.
