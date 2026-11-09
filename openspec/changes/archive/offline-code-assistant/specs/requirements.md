# Requirements: Offline Code Assistant

## Workspace Containment & Context Boundary

- The assistant SHALL read files ONLY from the actively opened workspace root.
- The assistant SHALL NOT perform full disk scanning or access paths outside the workspace directory.
- The assistant SHALL unconditionally ignore `.git/`, `node_modules/`, `dist/`, `.env*`, and binary file types from context indexing and prompt assembly.
- The assistant SHALL enforce strict payload size limits (maximum 100 KB per source file and maximum 8 KB per code selection).

## Offline Network & LLM Isolation

- The assistant SHALL send AI inference requests exclusively to `http://127.0.0.1:11434` (Ollama loopback endpoint).
- The assistant SHALL target the `qwen2.5-coder:7b` model by default.
- The assistant SHALL NOT transmit source code, metadata, or telemetry to any internet origin or remote host.
- The assistant SHALL NOT spawn background Ollama processes, trigger model downloads, or execute background shell commands.

## Local Session & Style Profile Management

- The assistant SHALL store chat histories and style profiles locally in VS Code workspace storage.
- The assistant SHALL provide user controls to delete individual or all chat sessions.
- The assistant SHALL provide a user control to trigger an on-demand rebuild or reset of the local style profile from active workspace files.

## Review & Diff Application Safety

- The assistant SHALL support review of active editor selection and whole files without modifying the file.
- The assistant SHALL display code proposals as structured diffs in the Composer view.
- The assistant SHALL NOT automatically write or overwrite files on the filesystem.
- The assistant SHALL apply code changes to the workspace buffer ONLY when the user explicitly clicks the Apply button.

## User Interface

- The extension SHALL provide a dedicated sidebar containing three views: `Sessions`, `Chat`, and `Composer`.
- All webview components SHALL enforce a strict Content Security Policy disallowing external script loading and network connections outside local webview resources.

## Integrity & Workflow Compliance

- The extension SHALL NOT auto-approve checkpoints, commit to git, push to remotes, or bypass human review.
