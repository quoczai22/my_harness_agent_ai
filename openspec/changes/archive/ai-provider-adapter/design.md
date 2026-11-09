# Design: Hybrid AI provider adapter

## Provider contract

`WorkflowSummaryProvider` accepts an explicitly constructed bounded workflow snapshot and returns text. Providers never receive workspace paths, artifact content, source code, or credentials other than the provider's own in-memory key.

## Local provider

The existing Ollama provider remains fixed to `http://127.0.0.1:11434/api/generate`, invoked only by a user command.

## OpenAI provider

- User selects `openai` explicitly and sets a model (default `gpt-6-astra`).
- A command saves the API key only through `ExtensionContext.secrets`; configuration stores no key.
- Request uses the Responses API with `store: false`, a bounded input snapshot, timeout, and no built-in tools.
- Cloud use has a confirmation notification identifying that summary metadata will leave the machine.

## Safety and tests

- Unit tests cover provider routing, payload bounds/redaction, fixed local URL, no-key behavior, and OpenAI request shape.
- The extension keeps all existing read-only guarantees.
