# Design

## Isolated VS Code launch

`npm run test:webview` builds the extension and invokes a Node runner. The runner resolves the existing `Code.exe` from an explicit override or `%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe`, verifies it exists, creates uniquely named temporary `user-data-dir` and `extensions-dir`, and launches the executable directly with `--extensionDevelopmentPath`, `--extensionTestsPath`, `--user-data-dir`, `--extensions-dir`, and `--disable-workspace-trust`. It does not use `@vscode/test-electron`, download binaries, or reuse the user's profile. A whole-run timeout kills the launched process tree on Windows; `finally` removes only directories this run created. Launch failure, including `EPERM`, prints the exact executable/arguments and original error, then exits without claiming a result. Cleanup failure is reported.

The compiled extension-host test is placed in a dedicated test directory excluded by `.vscodeignore`. The runner gives the launch process `CONTINUITY_EXTENSION_TEST=1`. `activate()` returns a minimal internal test API only under that environment flag. Outside test mode it retains the current API/behavior. No user command or setting is added.

## Real webview test

The test opens/focuses `continuity.assistant.chat`, waits for an explicit webview-ready handshake, loads `test-fixtures/scanned.pdf`, and calls the test-only API to invoke `ChatViewProvider.renderPdfPage` for page 1. The production render message follows the normal nonce-protected webview path. The test asserts returned JPEG base64 signature and decodability, byte size <= 2 MiB, long edge <= 1600 px, and nonblank pixel samples from the rendered canvas. Webview-side diagnostic metadata must establish whether pdf.js used a real Worker or fake-worker fallback; an ambiguous state is reported as unknown, not guessed. Diagnostics exist only for test mode and do not expose new user UI.

If a loaded `type: vlm` model is discoverable on LM Studio at `127.0.0.1:1234`, the test passes the rendered JPEG to `transcribeScanWithLmStudio` and prints the returned text. If server/model is unavailable, it prints `SKIP` with reason; this optional phase does not fail rendering verification. It never starts a server, loads/downloads a model, or changes settings.

If the render fails because of CSP, worker loading, or `localResourceRoots`, correct the actual 0.3.4 implementation inside the extension. A runtime-code fix requires version 0.3.5, packaging and installing the VSIX, and an explanation in this change's `verification.md`. If no runtime fix is needed, retain 0.3.4.
