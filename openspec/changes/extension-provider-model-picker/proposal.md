# Proposal: Pick local provider and model inside VS Code

The Offline Code Assistant currently requires editing VS Code Settings to switch between Ollama and LM Studio or select a model. Add a Command Palette command and status-bar button that list available chat/vision models from the chosen local provider and save the selection. LM Studio embeddings are excluded; an unloaded selected model is loaded locally before saving. The chat label added in version 0.3.1 should refresh through the existing configuration listener. No model download or remote endpoint is part of this change.
