# Harden Local Ollama Timeout

## Problem

The Offline Code Assistant aborts a local Ollama request after 30 seconds. Cold model loading for `qwen2.5-coder:7b` can legitimately exceed that period, producing a misleading failure.

## Goal

Use a bounded 90-second default for offline assistant requests and provide a clear cold-start timeout message without adding retries, cloud fallback, or background processes.
