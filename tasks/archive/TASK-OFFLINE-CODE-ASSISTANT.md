# Work order: Offline Code Assistant VS Code extension

## Objective

Create an offline-first code chat and review assistant inside VS Code using local Ollama `qwen2.5-coder:7b`, local style profiling, review selection/file workflows, and proposed diff application guarded by explicit user confirmation.

## Allowed Scope

- Specification and design files in `openspec/changes/offline-code-assistant/`.
- Extension modules under `extensions/continuity-vscode/src/assistant/` or equivalent package structure.
- Unit tests validating workspace isolation, ignore lists, loopback security, style profile lifecycle, and diff application safeguards.

## Explicit Exclusions & Prohibitions

- Do not send source code or metadata to any external/internet network endpoints.
- Do not scan the host disk outside the opened workspace root.
- Do not automatically modify, overwrite, or delete workspace files without explicit user Apply confirmation.
- Do not spawn shell commands, download models, or auto-approve checkpoints.
- Do not commit or push to git.

## Status

- Stage: CHECKPOINT_2 (impl_review requested, all 6 tasks completed and verified with 10/10 extension tests + 34/34 core tests)
- Awaiting human review and approval.

