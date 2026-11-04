# Proposal: Built-in PDF reading and an attach button for the VS Code extension

The user sends exam PDFs to the assistant in VS Code. Today `/pdf` fails on a fresh machine:

- it needs a separately installed `pdftotext` and a manual `continuity.pdfTextExecutable` path, which is empty by default;
- the PDF must already sit inside the project and be typed as a relative path;
- scanned PDFs only return an error.

Make PDF reading work with no extra installation, and let the user pick the exam file with a button. Scanned-page reading through the vision model is a later phase; this change only reports such pages clearly.

Budget: the user wants the whole offline kit (model plus every feature) at about 5 GB. This change may add at most 10 MB to the VSIX.
