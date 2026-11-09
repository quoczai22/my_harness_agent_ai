# Proposal: Correct local assistant labels

The chat view currently labels every non-user message `Ollama (qwen2.5-coder)`, even when LM Studio is configured. The generic query failure also names Ollama unconditionally. Show the configured provider and model in the chat and input hint, and name the configured provider in the generic error. This change covers presentation only; provider switching and inference behavior are separate backlog items.
