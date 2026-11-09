# Chat Timeline Navigation and Latest-Message Follow

## Problem

The Assistant Chat webview replaces its message HTML on refresh without restoring scroll position. New messages can therefore leave the user at the beginning of a long conversation. There is also no compact way to jump to an earlier user instruction.

## Goal

Give the chat a compact navigation rail modeled on conversation checkpoints: each user prompt has a clickable marker, hover preview, and deterministic target. The chat should follow the newest message after a send or response instead of jumping to the top.

## Scope

- Change only the VS Code Assistant Chat webview and its focused tests.
- Render user-message markers from persisted message IDs, with escaped preview text.
- Clicking a marker scrolls to its corresponding prompt.
- Refreshes caused by a new message scroll to the latest message; ordinary view refreshes preserve position when no new message exists.
