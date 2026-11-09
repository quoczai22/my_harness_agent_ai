# Verification: built-in PDF reading and Attach button (2026-11-04)

Spec approved by the user ("Duyệt và cho tải"), including the one-time npm download. continuity `check_scope` returned IN_SCOPE for all four tasks.

## Changes

- `pdfjs-dist` pinned to 6.5.438 as the only runtime dependency. `npm audit --omit=dev` reported 0 vulnerabilities. `scripts/vendor-pdfjs.cjs` copies `pdf.min.mjs`, `pdf.worker.min.mjs`, `cmaps/` and `LICENSE` into `dist/vendor/pdfjs` (2.9 MB, 172 files). `.vscodeignore` still excludes `node_modules`, and now also excludes `scripts/` and `test-fixtures/`.
- `src/assistant/pdfText.ts`, with no vscode dependency:
  - bounded extraction: 20 pages, 40,000 characters, 10 MB;
  - lines rebuilt from end-of-line markers and baselines;
  - scan detection for pages under 40 non-space characters;
  - order: bundled pdf.js → configured or PATH `pdftotext` → clear error;
  - `readAttachmentFile` covers PDF and image, with type and size limits.
- `localAttachments.ts`: typed `/pdf` and `/image` use the same reader, keeping the project-path check. `readChosenAttachment` handles files picked with the button.
- Chat view:
  - **Attach PDF/Image** button; the extension shows `showOpenDialog`, injected from `extension.ts` so `sidebarViews.ts` stays vscode-free at runtime;
  - a removable "Attached:" chip;
  - sending is allowed with only an attachment;
  - the typed draft survives re-renders. This fixed a latent overwrite of webview state by the scroll handler.
- `extension.ts` passes the chosen file through the send handler and notes `[Attached: name]` in the user message.
- Version 0.3.0.

## Evidence

- Extension suite **66/66**. The 7 new tests use real fixtures (Vietnamese text PDF from LibreOffice, image-only PDF, corrupt file) and cover:
  - Vietnamese diacritics and line order;
  - a scan reported as page 1, with no invented text;
  - a clear error for a corrupt PDF;
  - pdftotext used only when pdf.js fails;
  - the 20-page and character limits;
  - pdftotext discovery;
  - attachment type and size limits.
- Activation probe: no error; 15/15 commands; all views registered.
- VSIX: 47 KB → **1.55 MB** (+1.5 MB, within the 10 MB budget), 203 files.
- Installed with `--force`; VS Code lists `quoczai22.continuity-vscode@0.3.0`. The installed copy has no `node_modules`, and its bundled pdf.js extracted the Vietnamese fixture correctly.
  - pdf.js logs harmless warnings that `@napi-rs/canvas`, `DOMMatrix` and `Path2D` are unavailable. They only matter for rendering, which this change does not use.

## Not verified

- Clicking Attach and sending in a real VS Code window; the user needs **Developer: Reload Window**.
- The Node version inside VS Code's Electron was not measured. pdf.js declares Node ≥ 22.13, and it worked under the system Node 22.12 used for the tests.
- Scanned pages are only reported; reading them with the vision model is a later phase.
