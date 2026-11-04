# Requirements

1. A Command Palette command and status-bar item SHALL let the user choose Ollama or LM Studio, then choose a model actually reported by that provider.
2. Ollama models SHALL come from the local `/api/tags` response. LM Studio SHALL prefer local `/api/v0/models`, exclude models with `type: embeddings`, offer `llm` and `vlm`, and mark `vlm` as image-capable. If that API is unavailable, it SHALL fall back to `/v1/models` without claiming unknown vision capability. Empty, malformed, and unavailable results SHALL produce clear feedback without inventing models or downloading anything.
3. Selecting LM Studio while its server is stopped SHALL attempt `lms server start` with fixed, shell-free arguments, bounded readiness checks, and loopback-only access. It SHALL not accept non-loopback binding or endpoints.
4. If the selected LM Studio model is not loaded, the extension SHALL run fixed shell-free `lms load <id>` with visible progress and a bounded timeout, then verify availability. Load failure SHALL leave the prior selection intact and show a clear error.
5. A completed selection SHALL save `continuity.offlineAssistantProvider` and only that provider's model setting. Cancellation or discovery failure SHALL leave the prior selection intact.
6. The status item and existing chat label/placeholder SHALL update after configuration changes, including changes made outside the picker.
7. Plain-Node tests SHALL cover model discovery, startup, loading, selection and failure paths. The full extension `npm test` suite SHALL pass; a locally packaged extension SHALL be installed and its version verified. Interactive behavior that was not tested SHALL be disclosed.
