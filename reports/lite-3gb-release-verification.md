# Standalone 3 GB Lite Kit — verification (2026-09-23)

Artifact: `artifacts/Continuity-Lite-Terminal-Kit-3GB/`

- Size: 2.73 GiB; contains one GGUF model only.
- Model: `qwen2.5-coder-3b-instruct-q6_k.gguf`.
- SHA-256: `72491FEBB8B149ABACFD15A5E94E354B5FB6BDA6BAFFC292F9AEC270B94596C8`.
- Automated regression: two consecutive post-fix runs, 13/13 checks each. Checks cover model inference (3), PDF extraction, Word answers (2), PDF answers (2), Python review (2), and chat launcher (2).
- Interactive DOCX session: question 1 yielded 4; follow-up asking why explained 2 + 2 = 4; next-question command yielded 6 for question 2.
- An earlier regression run failed a Python-review assertion; the following two full runs passed. Model answers are nondeterministic, so this does not guarantee identical phrasing in future runs.
- Synthetic DOCX/session fixtures created for manual verification were removed. No user learning-library or existing session content was deleted.

Limits: PDF extraction is text-only (no OCR); runtime has not been tested on the school's actual hardware. Do not claim that all school PCs can run it until tested there.

No commit or push performed. Human implementation review remains required under the repository workflow.
