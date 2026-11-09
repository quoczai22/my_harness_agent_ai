# Fix Pre-Aborted Inline Completion Requests

## Problem

`queryInlineCompletion` attaches an abort listener but does not handle an `AbortSignal` already cancelled before the listener is attached. With Ollama running, that path can still send a request and return a completion.

## Goal

Return immediately without contacting Ollama for a pre-aborted signal, and retain abort behavior for an in-flight signal.
