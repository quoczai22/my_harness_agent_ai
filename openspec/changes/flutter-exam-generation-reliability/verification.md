# Verification: Flutter generation reliability (2026-10-30)

Scope: only `artifacts/Continuity-Flutter-Exam-LMStudio`. Baseline and changed kit used Qwen3.5-2B in LM Studio, context 8192, the same text and scanned PDF fixtures, the same Flutter SDK and the same generation settings. Each phase ran three repetitions per exam. LM Studio is nondeterministic; this sample does not establish a population-level improvement.

| Phase | Run 1 (files; projects) | Run 2 | Run 3 | Total | Min–max per run |
| --- | --- | --- | --- | --- | --- |
| Baseline | 3/5; 1/2 | 4/5; 1/2 | 3/5; 0/2 | 10/15; 2/6 | files 3/5–4/5; projects 0/2–1/2 |
| Changed | 4/5; 1/2 | 4/5; 1/2 | 5/5; 2/2 | 13/15; 4/6 | files 4/5–5/5; projects 1/2–2/2 |

Source reports, kept outside Git staging: `artifacts/Continuity-Flutter-Exam-LMStudio/tests/results/live-20261030-031604.md` (baseline) and `live-20261030-032729.md` (changed). Both reports include each file's analyzer history and the exam checklist. OCR word recall on the synthetic scanned page was 1.0 in all three runs; phone-photo accuracy remains untested. The baseline self-test passed 139/139 (including live assertions). After implementation, the offline self-test passed 131/131; the changed live test passed 146/146 before two final test-only fixtures were added.

The changed run had no missing-Form checklist result, but one `return_without_value` and one invalid `Form` return remained. Compilation improved in this small sample, while per-run ranges meet at their boundaries. The kit still does not run the Flutter app, so behavior is unverified. A target machine with 8 GB RAM and a phone-photo PDF remains a separate trial.

Implementation checks: structured `finish_reason` is retained for code generation; unmatched opening fences and chat truncation warnings are removed from Dart candidates; incomplete candidates bypass analyzer/repair and remain visible with a warning before any user-controlled SAVE. Validation gates use the screen's confirmed exam section and share the two-round model repair ceiling. Undefined-name repair prompts include analyzer symbols, lines, actual `State` declarations and model file context; no guessed field is auto-created.
