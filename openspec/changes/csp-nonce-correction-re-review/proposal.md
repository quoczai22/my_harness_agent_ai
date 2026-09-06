# Proposal: CSP Nonce Correction Re-Review

## Problem

The previous change `natural-offline-assistant-chat` was approved before an explicit formal re-review of the CSP nonce correction in `sidebarViews.ts` could be conducted.

## Goal

Conduct a narrow re-review change to formally verify that:
1. `wrapWebviewHtml` generates a cryptographically random, non-empty nonce per invocation.
2. All internal `<script>` tags receive the matching nonce.
3. Content-Security-Policy header correctly sets `script-src 'nonce-<nonce>'`.
4. Untrusted model text cannot inject executable scripts.
5. All test suites, packaging, and diff checks pass cleanly without touching working source unless a new defect is found.

## Scope

- Verification of `extensions/continuity-vscode/src/sidebarViews.ts` and test assertions in `extensions/continuity-vscode/src/assistant.test.ts`.
- No source code modifications unless a defect is discovered.
- No cloud providers, remote endpoints, or automatic git operations.
