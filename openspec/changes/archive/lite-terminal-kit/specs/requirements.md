# Requirements

- Only supplied local ZIP/GGUF payloads are staged; no download occurs.
- Launcher uses only `%~dp0` paths, does not call Ollama, VS Code, or `code`.
- Model context is constrained for weak 8 GB machines.
- Safe Python learning-library export is retained and manifest-verified.
- Tests verify structure, command contents, payload validation, and path independence.
