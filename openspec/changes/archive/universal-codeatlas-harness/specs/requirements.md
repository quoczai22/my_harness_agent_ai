# Requirements

## R1 — Project-agnostic operation

The Harness shall inspect any allowlisted local project without assuming a programming language, framework, course, or repository layout.

## R2 — Safe project index

The Harness shall expose a deterministic file tree and technology summary for a selected workspace while excluding secrets, generated folders, vendor folders, unsupported binaries, and files above configured limits.

## R3 — CodeAtlas-style navigation

The UI shall let the user search the project tree, select a file, inspect its text content, and see lightweight relationships derived from relative imports/references when available.

## R4 — Context isolation

Every session shall belong to exactly one workspace. Context, selected files, summaries, prompts, and proposed changes from one workspace shall not appear in another workspace.

## R5 — Neutral context packets

The server shall create a bounded, provider-neutral context packet containing project instructions, project metadata, selected safe files, session history metadata, and the current prompt.

## R6 — Honest provider status

The UI shall distinguish `available`, `authentication required`, `offline`, and `not installed` for Codex, Antigravity, and Ollama. It shall not display a provider as connected based only on a configured label.

## R7 — Orchestration choices

The UI shall offer Codex, Antigravity, Ollama, automatic routing, parallel comparison, and writer-reviewer modes. Unsupported modes shall remain disabled with an explanation until their adapters are connected.

## R8 — Safe change preview

Generated changes shall be represented as reviewable file proposals/diffs. This MVP shall not directly overwrite project files.

## R9 — Local-only service

The service shall listen on loopback only and reject filesystem requests outside registered workspace roots.

## R10 — Accessibility and responsive layout

The interface shall support keyboard navigation, visible focus states, narrow screens, loading states, empty states, and actionable error messages.
