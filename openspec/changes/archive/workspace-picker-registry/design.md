# Design

## User flow

1. The user clicks **Choose workspace** beside the active-project selector.
2. The local loopback server opens the operating system folder picker. On unsupported systems the UI requests an absolute path instead.
3. The server resolves the real directory path, rejects missing/non-directory targets, derives a stable workspace id, and stores only the workspace metadata.
4. The API returns the registered workspace. The UI refreshes the selector and activates it immediately.
5. Existing project-index, file-preview, session, and context APIs operate against the selected registered root.
6. The initial project screen renders a bounded Project Flow and the Harness execution flow for the active workspace.

## Project Flow

The graph is derived only from the existing safe index and explicit local relationships already recognized by Harness (for example relative imports, source references, and project references). Nodes represent safe files or bounded module groups; edges carry the detected relationship type. Selecting a node opens its safe preview. Large projects are capped and summarized so the browser remains responsive. Missing evidence is displayed as an unknown or disconnected region rather than an invented dependency.

## Harness Flow

The UI renders the provider-neutral execution path:

`Workspace → Safe index → Selected context → Provider route → Proposal/diff → Human checkpoint → Apply later`

The current available step is highlighted from real local state. Provider steps display honest unavailable/offline/auth-required states. Antigravity execution becomes available in this change; unimplemented provider executions and every automatic-application step remain visibly inactive rather than pretending work was executed.

## Antigravity CLI adapter

Harness resolves `agy` from `PATH`, then the standard Windows fallback `%LOCALAPPDATA%\\agy\\bin\\agy.exe`, with an optional explicit override reserved for configuration. Discovery uses `agy --version` only and never spends model quota. Authentication is verified only when the user explicitly runs a connection test or sends a prompt.

Prompts are delivered with `--input-format stream-json --output-format stream-json` over stdin so bounded context is not exposed in process arguments and is not limited by Windows command-line length. The process runs with `--sandbox`, `--mode plan`, and `--disable-slash-commands`; Harness never uses `--dangerously-skip-permissions`.

Each execution uses a Harness-owned temporary working directory rather than the selected project root. Only the provider-neutral safe context packet is supplied, preventing the CLI from bypassing Harness indexing to read or modify arbitrary project files. Returned result events are parsed into assistant text, token usage, duration, status, errors, and Antigravity conversation id. Conversation identity is stored with the owning Harness session and never shared across workspace roots.

Antigravity output is displayed as chat text and, when structured proposals are present, in the read-only proposal/diff area. Applying a patch remains outside this change and requires a later reviewed capability.

## Persistence

User additions are stored in `.continuity/workspaces.local.json` under the Harness host workspace. The configured registry remains read-only. At startup and request time, configured and local entries are merged by canonical path; user-friendly names may be updated without duplicating a project.

The appearance preference is browser-local UI state stored under one versioned localStorage key. `dark` and `light` resolve directly; `system` resolves through `prefers-color-scheme` and listens for changes. A small head bootstrap applies the resolved data attribute before CSS renders, while React owns the visible three-way control after hydration.

## Security boundaries

- The picker endpoint accepts POST only and the server remains bound to loopback.
- A native picker is opened only after an explicit UI action.
- Returned paths must resolve to existing directories.
- The selected root becomes allowlisted only after the user confirms it through the picker or typed-path fallback.
- Secret, binary, vendor, generated-file, traversal, and symlink protections remain enforced by the project index.
- The feature never scans drives or enumerates sibling directories to suggest projects.
- Flow graphs use only already-allowlisted indexed metadata and never bypass safe file reads.
- Antigravity receives only the bounded safe context assembled by Harness and runs outside the selected project tree.

## Platform behavior

Windows uses a local PowerShell folder picker with no network access. Other platforms receive an `unsupported` response and use the absolute-path fallback. Picker cancellation is not an error and does not modify the registry.

## Failure handling

The UI reports cancellation, invalid paths, registry write failures, and unavailable picker support without losing the current workspace. Registry writes are atomic and validated before replacement.

Graph generation reports truncation and unsupported relationships without blocking file navigation or workspace switching.

Antigravity executions have bounded input, output, and wall-clock limits, expose cancellation, and terminate their child process on timeout or client cancellation. Malformed stream events are ignored with diagnostics; terminal error events are surfaced without losing the session.

