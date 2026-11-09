# Requirements

- Sessions, Chat, and Composer controls SHALL work under strict nonce CSP.
- Generated webview HTML SHALL NOT contain inline JavaScript event attributes.
- Event handlers SHALL run only from extension-owned scripts with the matching nonce.
- Model text SHALL remain escaped and non-executable.
