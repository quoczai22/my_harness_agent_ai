# Requirements: CSP Nonce Correction Re-Review

## Functional & Security Requirements

1. `wrapWebviewHtml` SHALL generate a non-empty, cryptographically secure UUID nonce on each call.
2. The CSP header SHALL specify `script-src 'nonce-<nonce>'` with the exact generated nonce.
3. Every `<script>` tag in the rendered webview output SHALL carry the matching `nonce="<nonce>"` attribute.
4. Model-generated content and untrusted user input SHALL be escaped to prevent script tag injection or HTML bypass.
5. All extension tests, core tests, VSIX packaging, and `git diff --check` SHALL succeed without errors.
