# Requirements

- The kit can read text from an explicitly supplied `.docx` locally and without Internet.
- DOCX output is written only inside `sessions/documents/` using relative kit paths.
- Ordinary chat and document artifacts use separate session directories.
- Input passed to the model is bounded and failures identify unsupported, missing, or empty documents.
- No network, OCR, PATH mutation, automatic code edit, or model download is introduced.

