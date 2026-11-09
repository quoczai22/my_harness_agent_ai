# Design

- Add a visible trusted-agent command that accepts only a structured local proposal and routes every create/replace through `TrustedAutoWriteGateway`.
- Create uses `WorkspaceEdit.createFile` with overwrite disabled; replace requires an existing guarded file.
- Inline completion debounces requests, cancels obsolete work, and uses Qwen FIM control tokens (`<|fim_prefix|>`, `<|fim_suffix|>`, `<|fim_middle|>`).
- Tests use a real temporary workspace and fake WorkspaceEdit applier to prove create, replace, existing-create rejection, audit records, and no-write on rejected targets.
