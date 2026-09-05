# Requirements

## Extension packaging

- The project SHALL produce an installable VS Code `.vsix` from an independent extension package.
- The extension SHALL work offline for all state views and SHALL NOT require the dashboard server.

## Read-only workspace views

- The extension SHALL read state only from the active workspace's `.continuity/state.json`.
- Missing or malformed state SHALL render a safe empty/error view without throwing or writing files.
- The sidebar SHALL show stage, task/checkpoint/blocker summaries.
- The timeline SHALL show deterministic, bounded recent events.

## Local AI safety

- Ollama use SHALL require an explicit user command.
- The connector SHALL allow only the loopback Ollama origin `http://127.0.0.1:11434`.
- The extension SHALL NOT spawn Ollama, download models, persist prompts, or send workspace content to a remote origin.
- The generated summary payload SHALL be bounded and omit artifact/file contents.

## Integrity

- The extension SHALL NOT approve checkpoints, register tasks, alter state, commit, push, or execute shell commands.
