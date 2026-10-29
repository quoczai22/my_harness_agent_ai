# Requirements

- Inline requests SHALL use Ollama `prompt` and `suffix`, not FIM control tokens in ordinary prompt text.
- Requests SHALL be raw, bounded, local-only, cancellable, and keep the model warm.
- Tests SHALL assert payload shape and reject chat-prose regression.
