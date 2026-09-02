# Requirements

## Discussion gate

The server SHALL allow Codex, Antigravity, or a human to record a concrete discussion concern.

When one or more discussions are unresolved, the server SHALL reject `set_status`.

The server SHALL allow a human to resolve a matching discussion, preserve the resolution in the decision log, and restore state transitions once all blockers are gone.

## Task quality

Every registered task SHALL have at least three concrete technical keywords.
