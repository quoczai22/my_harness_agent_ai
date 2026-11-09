# Verification: chat sender label (2026-11-04)

Spec review approved by the user with one added requirement: the generic query failure must name the configured provider. The spec was updated before code. Continuity scope checked before implementation.

## Changes

- `ChatViewProvider` receives a configuration reader from `extension.ts`, avoiding a runtime `vscode` dependency in `sidebarViews.ts`. On each render it labels assistant messages and the placeholder with the selected Ollama or LM Studio model. Empty model settings show `model not selected`. User and system messages show `You` and `System`.
- Provider/model settings trigger chat refresh. Model text is HTML escaped. The generic query error uses the current provider name.
- `package.json` and the previously stale root version entries in `package-lock.json` now say 0.3.1.

## Checks

- `npm test` in `extensions/continuity-vscode`: **68/68 passed** (two new tests), including plain-Node rendering for Ollama, LM Studio, empty model, system label, escaped model text, and generic error wording.
- `npm run package`: succeeded; `continuity-workflow.vsix` has 203 files and is 1.55 MB.
- `code --install-extension continuity-workflow.vsix --force`: succeeded outside the filesystem sandbox after the sandbox blocked writes to VS Code's user extension directory.
- `code --list-extensions --show-versions`: reports `quoczai22.continuity-vscode@0.3.1` without errors outside the sandbox.
- `git diff --check`: passed.

## Not verified

- Interactive display and live Settings changes in an open VS Code window were not clicked through. Open windows may need **Developer: Reload Window** to load the installed version.
- Labels for older messages reflect the currently configured provider/model; this change does not store the model used for each earlier response.

No download, commit or push was performed.
