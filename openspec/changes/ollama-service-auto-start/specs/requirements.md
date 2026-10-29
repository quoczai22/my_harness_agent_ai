# Requirements

- The extension SHALL expose `continuity.ollamaAutoStart`, defaulting to true.
- When enabled, activation SHALL attempt only a loopback health probe and an `ollama serve` launch if unavailable.
- The launcher SHALL use a fixed executable and arguments with shell execution disabled.
- It SHALL deduplicate concurrent start requests and bound startup waiting.
- It SHALL never pull models or communicate with a remote endpoint.
- Tests SHALL cover already-ready, disabled, launch, bounded failure, and no-shell behavior.
