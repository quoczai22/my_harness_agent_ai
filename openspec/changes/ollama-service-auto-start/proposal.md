# Local Ollama Service Auto-Start

## Problem

The VS Code extension reports a generic `fetch failed` whenever Ollama is not already running. The local models may be installed, but the user must manually launch a service before the first assistant action.

## Goal

Make the extension start and verify the local Ollama service when VS Code activates, while preserving strict loopback-only and offline behavior.

## Scope

- Add an opt-out `continuity.ollamaAutoStart` setting, enabled by default.
- Probe only `127.0.0.1:11434`.
- Launch only `ollama serve` without a shell if the loopback probe fails.
- Bound readiness polling and give actionable errors; never pull models or access remote URLs.
