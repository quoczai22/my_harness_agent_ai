# Design

## Service guard

An `ensureLocalOllamaService` helper first requests the loopback tags endpoint with a short timeout. If available, it returns without spawning a process. Otherwise it spawns `ollama serve` with a fixed command/argument vector, hidden detached process, and no shell.

## Readiness

The helper polls only the same loopback endpoint for a bounded startup window. Concurrent callers share one in-flight startup promise, preventing duplicate `ollama serve` processes. Failure identifies either a missing executable or a service that did not become ready.

## Integration

Extension activation starts the guard in the background only when `continuity.ollamaAutoStart` is true. Assistant requests also run the guard before their fetch so a slow startup race is handled. No model download, external endpoint, or shell command is allowed.
