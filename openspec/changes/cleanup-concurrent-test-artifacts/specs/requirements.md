# Requirements

- The concurrent test SHALL use an isolated, unique state path.
- It SHALL remove its state, lock, and matching atomic-save temporary files in a `finally` block.
- It SHALL not remove unrelated files in `.continuity/`.
- The test suite SHALL assert that the test leaves no matching artifacts.
- Core tests SHALL continue to verify zero lost updates across two OS processes.
