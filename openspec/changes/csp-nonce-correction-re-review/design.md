# Design: CSP Nonce Correction Re-Review

## Architecture & Flow

`wrapWebviewHtml` in `extensions/continuity-vscode/src/sidebarViews.ts` implements strict nonce-based CSP for all VS Code sidebar webviews (Sessions, Chat, Composer):

1. **Nonce Generation**: Generates a fresh UUID via `crypto.randomUUID()` on each webview render.
2. **Script Injection Guard**: Replaces `<script>` with `<script nonce="${nonce}">` on the body template.
3. **CSP Interpolation**: Replaces `script-src 'nonce-'` in the `<meta http-equiv="Content-Security-Policy">` tag with `script-src 'nonce-${nonce}'`.
4. **Untrusted Model Escaping**: All model-derived output passes through `renderSafeMarkdown()` / `escapeHtml()` prior to inclusion, preventing script execution.

## Verification Approach

- Direct assertion that generated nonces are non-empty and match in both CSP meta and script tags.
- Execution of extension test suite (`18/18` pass).
- Packaging validation via `npm run package` creating `continuity-workflow.vsix`.
- Execution of `git diff --check` to ensure repository integrity.
