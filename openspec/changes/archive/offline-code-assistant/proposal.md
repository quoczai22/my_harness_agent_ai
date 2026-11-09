# Offline Code Assistant for VS Code

## Problem

Developers working in privacy-sensitive, offline, or restricted environments need an AI-assisted code chat and review assistant directly inside VS Code without leaking source code, configuration secrets, or workspace data to external cloud services. Existing online assistants send telemetry and source snippets to remote cloud endpoints and often introduce risks of unvetted automatic file modifications.

## Goal

Provide a lightweight, offline-first VS Code assistant powered by a local Ollama instance running `qwen2.5-coder:7b`. The assistant supports interactive chat, selection and whole-file code reviews, local style profile extraction, and structured proposed diff generation that requires explicit user confirmation before applying any change.

## Scope

- **Offline LLM Integration**: Connect exclusively to local Ollama at `http://127.0.0.1:11434` targeting `qwen2.5-coder:7b`.
- **Defensive Workspace Reading**: Read only currently opened workspace files with strict ignore rules (`.git`, `node_modules`, `dist`, `.env`, binary files) and rigid context window/file size caps.
- **Local Profile & Session Storage**: Persist conversation sessions and learned local style profiles exclusively on the local machine with one-click clear and rebuild capabilities.
- **Structured Diff Review**: Render proposed changes in a dedicated Composer/Diff view; apply edits to workspace files only after explicit user confirmation.
- **Dedicated Sidebar UI**: Provide a structured three-part sidebar surface covering Sessions, Chat, and Composer.

## Out of scope

- Connecting to any external cloud LLM APIs, remote endpoints, or telemetry services.
- Automatic file modifications, background disk indexing, or arbitrary shell execution.
- Bundling or auto-downloading large LLM model binaries inside the extension `.vsix`.
- Self-approving checkpoints, automated git commits, or pushing to remote repositories.
