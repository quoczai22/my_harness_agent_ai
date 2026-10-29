# Trusted Local Workspace Agent

## Goal

Extend the offline VS Code assistant with local inline suggestions, bounded workspace analysis, and an opt-in Trusted Workspace Auto-Write mode.

## Trusted Workspace boundary

When the user explicitly enables the mode for a workspace, the local Ollama agent may create or modify allowlisted text files under that workspace without per-file Apply confirmation. All mutations are recorded locally and are undoable through VS Code.

## Non-negotiable exclusions

- No paths outside the opened workspace, including links/reparse points.
- No `.git`, `.env*`, dependency/build folders, binary files, credentials, or private-key-like files.
- No file deletion, shell execution, process spawning, git commit/push, or external network calls.
- Mode is disabled by default and can be disabled immediately per workspace.
