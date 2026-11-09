# Verification: local provider and model picker (2026-11-04)

The user approved this spec and added LM Studio v0 model filtering/VLM marking plus fixed-command loading of unloaded models. Both were added to the spec before implementation. Continuity scope checks returned `IN_SCOPE` for all four task areas before code changes.

## Implemented

- Command Palette `Assistant: Select Local Provider and Model` and a status-bar button open a two-step Quick Pick. Current settings drive the button and the existing chat label/placeholder refreshes on provider/model changes.
- Ollama models come from loopback `/api/tags`, after the existing local Ollama service readiness/auto-start check. LM Studio models prefer `/api/v0/models`: only `llm` and `vlm` are offered; `embeddings` are omitted and `vlm` is labeled as image-capable. HTTP 404/405/501 falls back to `/v1/models` without claiming vision.
- When LM Studio is unavailable, `lms server start --bind 127.0.0.1 --port <configured local port>` runs without a shell and with bounded command/readiness time. The endpoint must be `127.0.0.1`. For an unloaded model, `lms load <id>` runs without a shell with a two-minute command timeout; `/v1/models` is checked afterward. VS Code progress notifications show discovery/start and loading.
- The selected provider/model are saved only after discovery and loading succeed. Cancellation leaves settings alone. The other provider's model remains set. Failed settings writes attempt to restore both prior values and report if restoration fails.
- Extension version and lockfile are 0.3.2.

## Checks

- Final `npm test` in `extensions/continuity-vscode`: **76/76 passed** (eight new tests).
- `npm run package`: succeeded; VSIX has 204 files and is 1.55 MB.
- `code --install-extension continuity-workflow.vsix --force`: succeeded. `code --list-extensions --show-versions` reports `quoczai22.continuity-vscode@0.3.2`.
- `git diff --check`: passed.
- `lms.exe` is present at `C:\Users\kienq\.lmstudio\bin\lms.exe`.

## Not verified

- The LM Studio server was not running on `127.0.0.1:1234` during verification. Real model listing, CLI startup/load, Quick Pick clicks, and chat/status refresh inside a VS Code window were not exercised; automated tests use injected API and CLI fakes. Open windows may need **Developer: Reload Window**.
- The picker explicitly binds a newly started server to `127.0.0.1` and only connects to that address. It does not independently inspect whether an already-running LM Studio server also listens on other interfaces.

No download, commit or push was performed.
