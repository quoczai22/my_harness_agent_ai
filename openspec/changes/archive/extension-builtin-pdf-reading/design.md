# Design

## PDF text without external tools

- Add `pdfjs-dist` (Mozilla, Apache-2.0), pinned to an exact version (6.5.438 at the time of writing).
  - It is downloaded once on the preparation PC with the user's permission.
  - The build copies only the legacy Node build needed for text extraction, plus its `cmaps`, into `dist/vendor/pdfjs/`, because `.vscodeignore` excludes `node_modules`. No other runtime dependency is added.
  - The license file is shipped beside it.
- `src/assistant/pdfText.ts` loads pdf.js with dynamic `import()`, using `isEvalSupported: false` and no font-face or network loading. It reads at most 20 pages and 40,000 characters.
  - Text items are joined into lines by their end-of-line markers and vertical position, so Vietnamese diacritics and line order are kept.
  - A page with fewer than 40 non-space characters counts as having no text layer.
- Order of extraction:
  1. pdf.js.
  2. If pdf.js throws: `continuity.pdfTextExecutable` when set, otherwise `pdftotext` found on PATH.
  3. Otherwise a clear Vietnamese and English error.
- Scanned pages are listed by number with the advice to send them as images (`/image`), until the vision phase exists. Text is never invented for them.

## Attach button

- The chat webview gets an **Attach** button. It posts `{ command: 'attach' }`, and the extension opens `showOpenDialog` (PDF, PNG, JPEG, WebP; one file).
- The chosen file may be anywhere because the user selected it explicitly. Size limits stay: PDF 10 MB, image 2 MB.
- The chat shows the attachment as a removable chip. The next **Send** includes it: PDF text, or the image data URL for the vision model. It is then cleared. Only the chosen file is ever read.
- Typed `/pdf <relative path> | question` and `/image …` keep working unchanged.
- The webview CSP stays nonce-only; the button uses the existing message pattern.

## Packaging and tests

- Version 0.3.0. VSIX growth must be ≤ 10 MB; report the before and after sizes.
- Fixtures, small and generated locally:
  - a Vietnamese text PDF (via LibreOffice);
  - an image-only PDF (via PIL);
  - a corrupt file.
- Unit tests:
  - Vietnamese text with diacritics is extracted;
  - the page and character limits hold;
  - an image-only PDF is reported as a scan, not as empty success;
  - a corrupt file gives a clear error;
  - fallback order when pdf.js fails, with an injected stub.
- The command-registration test and the activation probe still pass. The VSIX is installed with `--force` and VS Code lists 0.3.0.
- Interactive use in a VS Code window remains a manual step for the user.
