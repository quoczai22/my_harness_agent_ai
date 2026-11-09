# Offline VS Code extension

## Problem

The current dashboard requires a browser and local HTTP listener. Developers need a portable, offline-first workspace surface inside VS Code that can inspect Continuity state and optionally use an already-running Ollama server without exposing a service or changing project state.

## Scope

- Package a desktop VS Code extension as a `.vsix` artifact.
- Add a native sidebar for workspace stage, tasks, blockers, and checkpoints.
- Add a read-only timeline panel sourced from `.continuity/state.json` in the opened workspace.
- Add an optional loopback-only Ollama helper for explicit summarization; it never starts Ollama, downloads a model, or sends workspace data unless invoked by the user.
- Keep all reads workspace-contained and make malformed/missing state a safe empty view.

## Out of scope

- Browser dashboard replacement during this change.
- Automatic approval, commits, pushes, process spawning, model download, or network access beyond an explicit request to `127.0.0.1` Ollama.
- Bundling models inside the extension.
