# Design

- Register `continuity.setOpenAIKey`: a password input box stores the key in `context.secrets` under the existing `continuity.openaiApiKey` name. Empty input or Escape changes nothing. Register `continuity.clearOpenAIKey`, which deletes that secret. Messages never show the key.
- Auto-start Ollama only when `ollamaAutoStart` is true **and** `continuity.offlineAssistantProvider` or `continuity.summaryProvider` is `ollama`. The call stays fire-and-forget and keeps its existing console warning.
- Add a test that every command in `package.json` `contributes.commands` is registered in the extension sources, so a declared-but-missing command fails `npm test`.
- Bump the version to 0.2.1. Run `npm run package`, then `code --install-extension continuity-workflow.vsix --force`. Verify the installed folder holds the new build and that VS Code lists 0.2.1.
