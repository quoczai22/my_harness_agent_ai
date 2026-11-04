# Proposal: Fix VS Code extension install and missing commands

The user reported the VS Code extension "failed". Investigation (2026-11-04):

1. VS Code runs a stale build from 2026-09-08. The newer VSIX was never installed, and both builds are version 0.2.0, so VS Code does not update.
2. `continuity.setOpenAIKey` and `continuity.clearOpenAIKey` are declared in `package.json` but never registered, so they fail with "command not found". The OpenAI summary path reads a secret that nothing can store.
3. Activation always auto-starts Ollama when `ollamaAutoStart` is true, even if no provider is configured to use Ollama.

Fix those three issues, add a regression test, bump the version, and install the new build. Nothing else changes.
