# Design

- `extension.ts` reads `continuity.offlineAssistantProvider` and the corresponding model setting: `offlineAssistantModel` for Ollama, `lmStudioModel` for LM Studio. It injects a configuration reader into `ChatViewProvider` so `sidebarViews.ts` keeps no runtime `vscode` import.
- Resolve the label when rendering and refresh the view when these settings change. Show `Ollama (model)` or `LM Studio (model)` when a model is configured; show the provider with a clear `model not selected` hint when the model setting is empty. Never substitute an Ollama model for LM Studio.
- User messages remain `You`; system/error messages show `System`. Escape the provider/model text before placing it in HTML. The input placeholder describes the selected provider/model without a hard-coded model name.
- The generic query error in `extension.ts` names the currently configured provider; it never says `Ollama query failed` while LM Studio is selected.
- Labels describe the currently configured provider/model, not a historical per-message snapshot. Historical attribution would require persisted message metadata and is outside this presentation change.
- Add plain-Node tests for both providers, empty LM Studio model, system label, HTML escaping, configuration refresh, and generic error wording. Update version to 0.3.1, package and install the VSIX, then verify the installed version. No package download.
