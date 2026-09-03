# Requirements

## Concurrent Lost-Update Protection

### Scenario: Concurrent mutations by multiple processes
- **WHEN** two or more independent OS processes perform state mutations simultaneously on the same Continuity state file
- **THEN** all mutations SHALL execute atomically under file-based locking / synchronization
- **AND** updates from both processes SHALL be completely preserved without data loss or file corruption.

### Scenario: Stale lock recovery
- **WHEN** a process abnormally crashes holding a lock
- **THEN** subsequent processes SHALL detect stale locks after a timeout threshold and recover safely.

### Scenario: Concurrent multi-process test verification
- **WHEN** automated tests run
- **THEN** a dedicated concurrent test SHALL execute multiple Node child processes concurrently
- **AND** it SHALL assert that 100% of the concurrent updates from all processes exist in the finalized state file.
