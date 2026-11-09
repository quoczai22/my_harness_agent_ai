# Design: Offline VS Code extension

## Package boundary

Create `extensions/continuity-vscode/` as an independent TypeScript VS Code extension package. It packages to a `.vsix`; the core package stays usable without VS Code.

## State access

The extension resolves the active workspace folder and reads only `<workspace>/.continuity/state.json` through the VS Code filesystem API. It parses state defensively and exposes a read-only snapshot. No extension command mutates Continuity state.

## UI

- Native `TreeDataProvider` sidebar: stage, current change, tasks, blockers, and checkpoints.
- Status-bar item: compact stage indicator.
- Timeline command: read-only webview panel for chronological checkpoint and decision entries. The webview receives an already-sanitized snapshot and uses a restrictive content-security policy.

## Ollama connector

- Explicit command only, disabled unless a configured model is present.
- POST solely to `http://127.0.0.1:11434/api/generate` with a bounded, user-visible state summary.
- Timeout and clear offline/error message; no retry loop, no credentials, no arbitrary endpoint.
- Never spawn Ollama or download a model.

## Tests

Unit test state parsing, workspace containment, timeline ordering, redacted/bounded Ollama payload creation, URL allowlisting, and disabled/offline behavior. Package validation verifies that a `.vsix` can be produced without bundling secrets or models.
