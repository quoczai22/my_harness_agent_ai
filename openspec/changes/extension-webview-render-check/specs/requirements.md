# Requirements

## Test runner

- `npm run test:webview` MUST run against the VS Code already installed on the machine, launching `Code.exe` directly. It MUST NOT use `@vscode/test-electron` or download any dependency, VS Code binary, or model.
- It MUST isolate the run with fresh temporary user-data and extensions directories, `--extensionDevelopmentPath`, `--extensionTestsPath`, and `--disable-workspace-trust`; it MUST leave the user's existing windows, settings and extensions alone.
- The extension-host test MUST be excluded from the VSIX by `.vscodeignore`. An environment-gated API from `activate()` MUST exist only when `CONTINUITY_EXTENSION_TEST=1`; normal users MUST get no new command, setting or behavior.
- The complete run MUST have a timeout, terminate its process tree on timeout, and clean only its own temporary directories. If launch fails, output MUST include the exact command and original error. Cleanup errors MUST be visible.

## Rendering assertion

- The test MUST open `continuity.assistant.chat`, await an explicit ready signal, and use the real chat webview to render page 1 of `test-fixtures/scanned.pdf` through the production `renderPdfPage` path.
- It MUST assert a decodable base64 JPEG, longest edge <= 1600 px, payload <= 2 MiB, and visible nonwhite page content by sampling pixels. It MUST report whether pdf.js used a real Worker, fake worker, or an unobservable state, with evidence from the webview runtime.
- A webview render failure MUST fail the test and report diagnostics. If caused by CSP, worker or resource roots, fix the cause in the extension and describe it in `verification.md`.

## Optional VLM probe and release

- If LM Studio responds on `127.0.0.1:1234` with a loaded VLM, the test MUST call `transcribeScanWithLmStudio` with the rendered image and print its transcript. Otherwise it MUST print a clear `SKIP` reason and not fail the render test.
- Run `npm test` and `npm run test:webview` and record actual outputs and unverified cases in `verification.md`. If runtime code changed, bump to 0.3.5, package/install VSIX, and verify the installed version. Do not download, commit or push.
