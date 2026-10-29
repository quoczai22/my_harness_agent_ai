# Work Order: Ollama Service Auto-Start

## Objective

Start the installed local Ollama service automatically for the offline VS Code assistant when the extension is enabled.

## Constraints

- Loopback only: `127.0.0.1:11434`.
- Never download/pull a model or contact the Internet.
- Fixed `ollama serve` command with no shell execution.
- Setting remains opt-out and defaults to enabled.
- No commit or push.
