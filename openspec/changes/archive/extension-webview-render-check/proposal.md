# Proposal: verify scanned PDF rendering in real VS Code webview

The 0.3.4 scanned-PDF feature passed Node tests, but rendering with the bundled pdf.js worker under the actual VS Code webview CSP remains unverified. Add a repeatable local integration test that launches the already-installed VS Code in an isolated profile and exercises the real chat webview. Do not download a test copy of VS Code.

Scope: `extensions/continuity-vscode` only. This change adds a test-only bridge and runner, with a production fix and version 0.3.5 only if the test exposes a rendering defect.
