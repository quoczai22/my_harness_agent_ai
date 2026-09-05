# Hybrid AI provider adapter

## Problem

The offline VS Code extension currently supports an explicit Ollama summary only. Developers need an opt-in cloud reasoning provider for difficult review tasks while preserving an offline default, credential safety, and the existing human-controlled Continuity workflow.

## Scope

- Introduce a provider interface for bounded, read-only workflow summaries.
- Preserve Ollama as the default local provider.
- Add an OpenAI Responses API provider using an explicit model configuration and VS Code Secret Storage for its API key.
- Add a settings UI/commands to choose provider and store/remove the cloud key locally.
- Return proposed review text only; no provider can alter Continuity state, run shell commands, approve checkpoints, commit, or push.

## Out of scope

- Background/automatic requests, agent loops, remote key storage, model auto-selection, computer use, or sending artifact/file contents.
