# Requirements

- The extension SHALL default to the local Ollama provider and SHALL make no cloud request without explicit provider selection and user invocation.
- OpenAI credentials SHALL be stored only with VS Code Secret Storage and SHALL NOT appear in settings, logs, state, VSIX, or source control.
- OpenAI requests SHALL use the Responses API with `store: false`, an explicit model, bounded/redacted workflow summary, timeout, and no external tools.
- Before each OpenAI request, the extension SHALL clearly state that bounded workflow metadata will be sent to OpenAI and require confirmation.
- Provider output SHALL be informational text only and SHALL NOT mutate Continuity state, execute commands, approve checkpoints, commit, or push.
- The local Ollama provider SHALL remain limited to `127.0.0.1:11434`.
