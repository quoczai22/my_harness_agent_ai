# Requirements

- A pre-aborted inline completion request SHALL return an empty completion without contacting Ollama.
- An in-flight cancellation SHALL abort the request and return an empty completion.
- The change SHALL preserve loopback-only validation.
