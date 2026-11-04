# Requirements

1. The chat assistant label SHALL reflect the current `continuity.offlineAssistantProvider` and its corresponding configured model (`offlineAssistantModel` for Ollama, `lmStudioModel` for LM Studio).
2. The input placeholder SHALL contain no hard-coded model name and SHALL reflect the current configured provider/model.
3. The chat SHALL label user and system/error messages accurately, and SHALL escape configuration-derived text in HTML.
4. The chat SHALL refresh when relevant configuration settings change, without adding a runtime `vscode` dependency to `sidebarViews.ts`.
5. A generic query failure SHALL name the configured provider, never hard-code Ollama when LM Studio is selected.
6. The extension SHALL pass its full `npm test` suite, package as version 0.3.1, install from the local VSIX, and report whether `code --list-extensions --show-versions` shows 0.3.1. Unverified interactive behavior SHALL be stated explicitly.
