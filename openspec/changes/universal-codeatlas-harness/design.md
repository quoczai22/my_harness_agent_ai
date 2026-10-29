# Design

## Product surface

Extend the existing loopback dashboard into a three-column developer workspace:

1. A project rail and searchable file tree.
2. A central code/context canvas with project overview, detected technology signals, files, and lightweight relationships.
3. An agent/session rail showing Codex, Antigravity, and Ollama availability plus isolated conversation sessions and pending changes.

The initial release is useful without any model connection: it can register an allowlisted workspace, inspect its safe file inventory, select files, and build a bounded context packet. Provider adapters consume that neutral packet later.

## Context hierarchy

Context is assembled in this order:

1. Global user preferences explicitly stored by the user.
2. Project-local instructions such as `AGENTS.md` or `README.md`.
3. A generated project index and detected technology metadata.
4. The selected session history.
5. Explicitly selected files and the current prompt.

No project inherits another project's generated index or session history. No course- or framework-specific prompt is embedded in the application.

## Security boundaries

- Bind only to `127.0.0.1`.
- Read only from workspaces already present in the allowlisted workspace registry.
- Resolve and validate every requested path beneath its registered workspace root.
- Exclude secrets and generated/vendor folders by default, including `.git`, `.env*`, credential files, `node_modules`, `bin`, `obj`, `.vs`, and large binary artifacts.
- The MVP previews proposed changes but does not write project files.
- Provider credentials never enter browser state or repository files.

## Provider staging

The UI exposes provider states from a common adapter contract:

- Codex: future Codex app-server plus official Sign in with ChatGPT.
- Antigravity: future official Antigravity CLI/SDK integration.
- Ollama: existing localhost provider for offline fallback.

For this change, adapters report discovery/availability and the UI supports provider selection and orchestration modes without impersonating a successful connection.

## Persistence

Project metadata and session records are stored under Continuity's local state. Session records contain stable IDs, project ownership, title, timestamps, selected provider mode, and bounded message metadata. Large source contents are re-read from validated files rather than duplicated into session storage.

## Verification

Add tests for traversal rejection, ignored-file filtering, project isolation, deterministic indexing, context-size bounds, and provider-state honesty. Build the React UI and exercise the local API endpoints.
