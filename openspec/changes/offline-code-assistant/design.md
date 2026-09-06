# Design: Offline Code Assistant for VS Code

## Architecture Overview

The Offline Code Assistant is implemented as a modular subsystem within the VS Code extension (`extensions/continuity-vscode/` or companion assistant module), structured into five decoupled layers:

1. **Workspace Context Guard (`src/assistant/context/`)**:
   - Discovers files within the active workspace using VS Code's `workspace.findFiles` with hardcoded exclusion globs: `**/.git/**`, `**/node_modules/**`, `**/dist/**`, `**/.env*`, and binary file pattern matchers.
   - Enforces strict file-size limits (e.g. maximum 100 KB per file, maximum 8 KB per selection prompt) and total context truncation guards to keep inference deterministic and bounded.
   - Prohibits directory traversal or disk access outside the designated workspace root.

2. **Loopback Ollama Adapter (`src/assistant/llm/`)**:
   - Enforces an immutable endpoint constraint: only `http://127.0.0.1:11434/api/generate` and `http://127.0.0.1:11434/api/chat`.
   - Default model locked to `qwen2.5-coder:7b`.
   - Configurable timeout (default 30s) with clear offline and connectivity diagnosis. No automatic retry storms, no external fallback servers, no model downloading triggers.

3. **Local Store & Style Profiler (`src/assistant/store/`)**:
   - Stores session chat logs and local coding style profiles in VS Code `ExtensionContext.workspaceState` / `globalStorageUri`.
   - Style profiler extracts local coding conventions (indentation style, naming conventions, docstring patterns, typing habits) only on-demand.
   - Provides explicit actions: `Clear All Sessions`, `Export Session`, `Rebuild Style Profile`, `Reset Style Profile`.

4. **Sidebar Webview UI (`src/assistant/ui/`)**:
   - Houses three cohesive panels:
     - **Sessions View**: List of active/archived chat threads, new chat creation, delete session.
     - **Chat View**: Conversational interface supporting `/review`, `/explain`, `/refactor` with active editor selection or whole-file context, and style profile badge.
     - **Composer View**: Unified diff preview comparing original vs proposed code with syntax highlighting, inline diff view, and clear `[Apply Changes]` and `[Discard]` buttons.
   - Strict Content Security Policy (CSP): `default-src 'none'; img-src vscode-resource: https:; script-src 'nonce-...'; style-src vscode-resource: 'unsafe-inline';`.

5. **Diff Applicator & Safety Gate (`src/assistant/diff/`)**:
   - Generates standardized unified diffs from model outputs.
   - Disallows direct automatic writes to the filesystem.
   - When the user clicks `[Apply Changes]`, uses VS Code's `vscode.WorkspaceEdit` transaction so that changes appear in the editor buffer as an undoable action and require explicit user saving.

## Data Flow

```text
[Active Workspace Editor / Selection]
            │
            ▼ (Validate path, ignore patterns, size limits)
[Workspace Context Guard]
            │
            ├─► [Local Style Profile]
            │
            ▼ (Bounded prompt assembly)
[Loopback Ollama Client (127.0.0.1:11434 / qwen2.5-coder:7b)]
            │
            ▼ (Stream response & extract diff block)
[Sidebar Chat & Composer UI]
            │
            ├─► [Review Selection / File Feedback]
            └─► [Interactive Proposed Diff] ──(User clicks "Apply")──► [VS Code WorkspaceEdit]
```

## Security & Privacy Invariants

- All network requests strictly address `127.0.0.1:11434`. Any attempt to configure non-loopback hosts is rejected with a validation error.
- Sensitive files (`.env`, private keys, secrets, `.git`, `node_modules`, `dist`) are systematically blocked from prompt injection.
- Zero telemetry or internet egress.
- All file modifications are manual and reversible.
