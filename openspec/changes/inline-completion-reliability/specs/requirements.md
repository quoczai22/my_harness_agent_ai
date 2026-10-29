# Requirements

- Inline suggestions SHALL wait for local Ollama readiness.
- Cold-start and generation timeouts SHALL be bounded but sufficient for local coder models.
- Cancellation SHALL not silently mask all diagnostics.
- No remote endpoint or source leakage is permitted.
