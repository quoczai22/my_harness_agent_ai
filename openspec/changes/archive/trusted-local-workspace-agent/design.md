# Design

1. **Inline completion provider** supplies debounced, cancellation-aware suggestions from local Ollama using only bounded active-document context.
2. **Workspace index** is opt-in and incremental. It uses the existing safe-path guard, size limits, ignored paths, and local workspace storage.
3. **Trusted mutation gateway** accepts only structured edit/create operations. It resolves every target against the workspace root, rejects excluded/reparse paths, applies a single VS Code WorkspaceEdit transaction, and writes a local audit record.
4. **Permission model** persists a per-workspace `trustedAutoWrite` setting defaulting to false. Enabling/disabling always requires a visible command action; enabled mode never authorizes delete, shell, Git, or network capabilities.

All inference remains loopback-only at `http://127.0.0.1:11434`.
