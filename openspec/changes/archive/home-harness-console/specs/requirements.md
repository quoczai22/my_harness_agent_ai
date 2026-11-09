# Requirements

- Console SHALL bind only to `127.0.0.1` and reject mutation HTTP methods.
- Ollama and LocalAI endpoints SHALL be fixed loopback allowlists; no arbitrary URLs.
- OpenAI use SHALL remain opt-in, mediated locally, secret-safe and audit-visible.
- Queue/lane automation SHALL NOT approve checkpoints, commit, push, or execute unreviewed commands.
- UI SHALL display provider health, lane state, policy decision and audit timeline.
- Missing providers SHALL fail safely without blocking offline views.
