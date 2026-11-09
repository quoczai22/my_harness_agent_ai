# Design

Bundle a small portable `pdftotext` binary with required DLLs in `tools/pdf/`. `Read-PDF.cmd` validates a dropped PDF path, writes extracted text under `sessions/pdf/`, records the source path and extraction result, and launches the existing terminal assistant with a bounded text chunk. No OCR, vision model, network, or automatic file writes occur.
