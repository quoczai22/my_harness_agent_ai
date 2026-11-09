# Verification: fix extension commands and install (2026-11-04)

Spec approved by the user ("Duyệt spec"); continuity `check_scope` returned IN_SCOPE for the command, auto-start and test tasks.

## Changes

- `src/extension.ts`:
  - registers `continuity.setOpenAIKey`: a password input box stores the key in SecretStorage; empty input or cancel changes nothing, and the key is never echoed;
  - registers `continuity.clearOpenAIKey`, which deletes that secret;
  - auto-starts Ollama only when `ollamaAutoStart` is on and `offlineAssistantProvider` or `summaryProvider` is `ollama`.
- `src/commands.test.ts`: fails if any command in `package.json` `contributes.commands` lacks a `registerCommand("…")` in the sources.
- `package.json`: version 0.2.1.

## Evidence

- Extension suite **59/59**, including the new registration test.
- Activation probe (fake `vscode` module, real `dist/extension.js`): activate runs without error. 15/15 contributed commands are registered (0.2.0 had 13/15) and all 4 views have providers.
- `npm run package` produced `continuity-workflow.vsix` (30 files, 47 KB, no test files).
- `code --install-extension continuity-workflow.vsix --force` succeeded. VS Code lists `quoczai22.continuity-vscode@0.2.1`, and the installed `dist/extension.js` is byte-identical to the current build. Before this, VS Code ran a 2026-09-08 build without the LM Studio client and the newer assistant modules.

## Not verified

- Interactive use in a VS Code window (chat, LM Studio provider, key commands) was not exercised. Open VS Code windows must run **Developer: Reload Window** to load 0.2.1.
- The user's settings still select Ollama (`qwen2.5-coder:7b`, available). Using LM Studio needs `continuity.offlineAssistantProvider = lmstudio` and `continuity.lmStudioModel = qwen3.5-2b`; that is a user choice and was not changed.
