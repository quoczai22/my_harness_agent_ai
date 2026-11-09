# Switchable Isolated Assistant Sessions

## Problem

Saved sessions can be created but cannot be selected from the Sessions view. Ollama requests also omit the selected session's prior conversation, so the model does not retain a bounded per-session context.

## Goal

Let users switch between saved chats and give each selected session an isolated, bounded conversation history for local model prompts.

## Scope

- Add an explicit active-session selection operation and clickable session rows.
- Refresh Chat/Sessions after a switch and visually mark the active session.
- Serialize only the active session's recent messages into a bounded prompt context.
- Exclude system/error messages and keep file context handling unchanged.
