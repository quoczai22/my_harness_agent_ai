# Requirements

- The extension SHALL provide an inline completion provider using bounded active-document context and local Ollama only.
- Workspace analysis SHALL be opt-in, bounded, incremental, and limited to guarded workspace files.
- Trusted Auto-Write SHALL default to disabled and be toggled through visible commands.
- Enabled Trusted Auto-Write SHALL allow only guarded text-file create/replace edits inside the workspace via VS Code WorkspaceEdit and SHALL write a local audit record.
- Trusted Auto-Write SHALL reject deletes, excluded/sensitive paths, links/reparse points, outside-workspace targets, shell execution, Git operations, and external endpoints.
- Every auto-write SHALL remain undoable in VS Code.
- Tests SHALL cover cancellation, guards, enablement, audit records, rejected targets, and no-delete behavior.
