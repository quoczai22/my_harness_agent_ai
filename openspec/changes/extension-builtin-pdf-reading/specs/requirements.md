# Requirements

1. `/pdf` and the Attach button SHALL extract PDF text without any separately installed tool or setting. `pdftotext` SHALL remain an optional fallback.
2. Extraction SHALL be local only, bounded to 20 pages, 40,000 characters and 10 MB, and SHALL preserve Vietnamese diacritics.
3. Pages without a text layer SHALL be reported by number with advice to send them as images; no text SHALL be invented.
4. An Attach button SHALL let the user pick one PDF or image from anywhere. Only that file SHALL be read, and the attachment SHALL be visible and removable before sending.
5. Existing `/pdf` and `/image` syntax SHALL keep working.
6. The VSIX SHALL grow by at most 10 MB, ship the pdf.js license, and add no network access.
7. Tests SHALL cover Vietnamese extraction, limits, scanned and corrupt files, and fallback order. The new build SHALL be installed into VS Code as 0.3.0.
