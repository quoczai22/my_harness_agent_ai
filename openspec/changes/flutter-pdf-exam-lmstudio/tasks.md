# Tasks

- [x] Resolve open questions 1–4 with the user: content and project shape unknown (keep generic rules), no authoritative notes (the exam text is the source of truth), SDK unknown (bundle one).
- [x] Stage the independent kit folder: launcher, REPL, `lib/`, PDF tools copied from the LM Studio kit, manifest with hashes; BOM-encoded PowerShell scripts.
- [x] Implement the loopback-only LM Studio client with server/model detection, vision capability probe, timeouts and Vietnamese error mapping.
- [x] Implement PDF intake: text extraction, no-text-page detection, optional vision transcription, normalisation, and user confirmation/correction before storing the exam. Measure transcription accuracy on a scanned sample; disable the vision path by default if it is not usable.
- [x] Implement Flutter project intake: pubspec reader, file discovery with skips, secret redaction, compact project summary.
- [x] Implement `/ask` and `/file` with safe drafts, the JSON→Dart model generator, the `main.dart` skeleton, and mechanical import repairs.
- [x] Implement `/check` and `/analyze` (temporary copy, `--no-pub`, SDK detection).
- [x] Offline tests with fixtures (text PDF, scanned PDF, correct and broken Flutter projects); live tests on two exam PDFs; report results and limitations.
- [x] Record checkpoints in continuity: spec review approved (`cp_1793301356674_caobr`, recorded retroactively from the user's instructions); implementation review `cp_1793301381073_3vdrj` approved by the user; change closed.
- [x] ~~Bundle authoritative Flutter notes~~: not applicable, the user has no notes and adapts to each exam.
- [x] Prepare a Flutter SDK for offline exams (bundled SDK and pub cache, approved download) and compile-verify generated code; add the quick-fix and model repair loop.
- [ ] Trial on target conditions: school PC, 8 GB RAM, clean offline PC, phone photos of exam pages.
